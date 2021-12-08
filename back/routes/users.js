const express = require('express');
const router = express.Router();
const { query } = require('../modules/db');
const { sign, verifyMiddleWare } = require('../modules/jwt');
var fs = require('fs'); // 1
var multer   = require('multer'); // 1
var storage  = multer.diskStorage({ // 2
  destination(req, file, cb) {
    cb(null, 'uploadedFiles/');
  },
  filename(req, file, cb) {
    cb(null, `${Date.now()}__${file.originalname}`);
  },
});
var upload = multer({ dest: 'uploadedFiles/' }); // 3-1
var uploadWithOriginalFilename = multer({ storage: storage }); // 3-2




router.get('/onlinefriend', verifyMiddleWare, async(req, res, next) => {
  const { id } = req.decoded;
  const on_friend = await query(`SELECT * from users,friends where user_connected = 1 and user_id=followee and follower = '${id}' ORDER BY user_name ASC;`);
  res.json({on_friend})
});
router.get('/offlinefriend', verifyMiddleWare, async(req, res, next) => {
  const { id } = req.decoded;
  const off_friend = await query(`SELECT * from users,friends where user_connected = 0 and user_id=followee and follower = '${id}' ORDER BY user_name DESC;`);
  res.json({off_friend})
});
router.post('/signIn', async (req, res, next) => {
  console.log("------------ENTER signin-----------------");
  const { id, password } = req.body;
  const queryResult = await query(`SELECT * from users where user_id = '${id}' and user_pw = '${password}';`);
  console.log(queryResult);
  if (queryResult.length > 0) {
    await query(`UPDATE users SET user_connected = 1 WHERE user_id = '${id}';`);
    const jwt = sign({
      id,
      name: queryResult[0].user_name,
      connected: queryResult[0].user_connected
    });
    res.cookie('token', jwt, {
      httpOnly: true,
      expires: new Date( Date.now() + 60 * 60 * 1000 * 24 * 7) // 7일 후 만료
    }).json({
      success: true,
      id,
      name: queryResult[0].user_name,
      connected: queryResult[0].user_connected
    });
  } else {
    res.json({
      success: false,
      errorMessage: 'Incorrect id or password'
    });
  }
});

router.get('/whoAmI', verifyMiddleWare, async (req, res, next) => {
  console.log(req.decoded);
  const { id, name , connected} = req.decoded;

  if (id) {
    res.json({
      success: true,
      id,
      name,
      connected
    });
  } else {
    res.json({
      success: false,
      errorMesage: 'Authentication is required'
    });
  }
});

router.get('/friends', verifyMiddleWare, async (req, res, next) => {
  const { id } = req.decoded;
  console.log('enter friends');
  if (id) {
    const friends = (await query(`SELECT user_id, user_name, user_connected FROM users where user_id in (SELECT followee FROM friends WHERE follower in (SELECT user_id FROM users WHERE user_id = '${id}'))`));
    res.json({
      success: true,
      friends
    });
  } else {
    res.json({
      success: false,
      errorMessage: 'Authentication is required'
    });
  }
});

router.post('/addFriends', verifyMiddleWare, async (req, res, next) => {
  const { id } = req.decoded;
  const { friend_id } = req.body;

  if (id) {
    if (friend_id) {
      const friends_array = await query(`SELECT * FROM friends WHERE (follower, 
        followee) in (SELECT u1.user_id, u2.user_id from users u1, users u2 WHERE u1.user_id = '${id}' and u2.user_id = '${friend_id}');`);

      if (friends_array.length > 0) {
        res.json({
          success: false,
          errorMessage: 'already exists!'
        }); 
      } else {
        await query(`INSERT INTO friends(follower, followee) (SELECT u1.user_id, u2.user_id from users u1, users u2 WHERE u1.user_id = '${id}' and u2.user_id = '${friend_id}');`);

        res.json({
          success: true,
        });
      }
    } else {
      res.json({
        success: false,
        errorMessage: 'no friend_id'
      });
    }
  } else {
    res.json({
      success: false,
      errorMessage: 'Authentication is required'
    });
  }
});

router.post('/removeFriends', verifyMiddleWare, async (req, res, next) => {
  console.log('enter remove Friend!');
  const { id } = req.decoded;
  console.log(id);
  const { friend_id } = req.body;
  console.log(friend_id);
  if (id) {
    if (friend_id) {
      const friends_array = await query(`SELECT * FROM friends WHERE (follower, 
        followee) in (SELECT u1.user_id, u2.user_id from users u1, users u2 WHERE u1.user_id = '${id}' and u2.user_id = '${friend_id}');`);
      console.log(friends_array);
      if (friends_array.length === 0) {
        res.json({
          success: false,
          errorMessage: 'Not exists id!'
        });
      } else {
        await query(`DELETE FROM friends where (follower, followee) in (SELECT u1.user_id, u2.user_id from users u1, users u2 WHERE u1.user_id = '${id}' and u2.user_id = '${friend_id}');`);

        res.json({
          success: true,
        });
      }
    } else {
      res.json({
        success: false,
        errorMessage: 'no friend_id'
      });
    }
  } else {
    res.json({
      success: false,
      errorMessage: 'Authentication is required'
    });
  }
});

router.get('/signOut', verifyMiddleWare, (req, res, next) => {
  const { id } = req.decoded;
  query(`UPDATE users SET user_connected = 0 WHERE user_id = '${id}'`);

  if (id) {
    res.clearCookie('token').json({
      success: true
    })
  } else {
    res.json({
      success: false,
      errorMessage: 'Jwt not exists'
    })
  }
});

router.post('/signUp', async (req, res, next) => {
  const { id, password, name, user_type} = req.body;
  const id_regex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{4,20}$/; // 4~20자리의 문자 및 숫자 1개 이상씩 사용한 정규식
  const name_regex = /^[가-힣a-zA-z]{3,20}$/;

  // 아이디 유효성 검사 통과 x
  if (!id_regex.test(id)) {
    res.json({
      success: false,
      errorMessage: 'Unvalid id'
    });
  } else if (!name_regex.test(name)) {
    res.json({
      success: false,
      errorMessage: 'Unvalid name'
    });
  } else { // 통과 O
    // 중복 확인
    const queryResult = await query(`SELECT * from users where user_id = '${id}'`);
    if (queryResult.length > 0) {
      res.json({
        success: false,
        errorMessage: 'Duplicate id'
      });
    } else {
      usertypenum = 0;
      if (user_type === "general") {
        usertypenum = 1;
      }
      else if (user_type === "student") {
        usertypenum = 2;
      }
      else if (user_type === "teacher") {
        usertypenum = 3;
      }
      else if (user_type === "company") {
        usertypenum = 4;
      }
      await query(`INSERT INTO users(user_id, user_pw, user_name, user_connected, user_type) VALUES('${id}', '${password}', '${name}', 1, '${usertypenum}')`);

      res.json({
        success: true,
        name: name,
        connected:1
      });
    }
  }
});
router.get('/onlineuser', verifyMiddleWare, async(req, res, next) => {
  const { id } = req.decoded;
  const queryResult = await query(`SELECT * from users where user_connected = 1 and user_id <> '${id}'`);
  res.json({queryResult})
});

router.get('/onlineuser2', verifyMiddleWare, async(req, res, next) => {
  const { id } = req.decoded;
  const queryResult2 = await query(`SELECT * from users where user_connected = 0 and user_id <> '${id}'`);
  res.json({queryResult2})
});


router.post('/idDuplicateCheck', async (req, res, next) => {
  const { id, password, name, usertype } = req.body;
  const queryResult = await query(`SELECT * from users where user_id = '${id}'`);
  if (queryResult.length > 0) {
    res.json({
      success: false,
      errorMessage: '중복된 아이디입니다.'
    });
  } 
  else {
    res.json({
      success: true
    });
  }
});

router.get('/SetProfile', verifyMiddleWare, async (req, res, next) => {
  console.log("enter profile")
  const { id } = req.decoded;
  
  const queryResult = await query(`SELECT * from users where user_id = '${id}'`);
  res.json({
    queryResult
  });


});

router.post('/EditStatusMsg', verifyMiddleWare, async (req, res, next) => {
  console.log(req.body);

  const { id } = req.decoded;
  const { statusmsg } = req.body;
  await query(`UPDATE users SET user_status='${statusmsg}' where user_id='${id}'`);
  res.json({
    success: true
  });

});


router.get('/withdrawal', verifyMiddleWare, async (req, res, next) => {
  const { id } = req.decoded;
  
  await query(`DELETE from users where user_id='${id}' `);
  res.json({
    success: true
  });
});



router.get('/UpdatemyPlace', verifyMiddleWare, async(req, res, next) => {
  const { id } = req.decoded;


  var data = require("fs").readFileSync("./routes/test.csv", "utf8")
  data = data.split("\r\n")
  
  const lat=data[0].split(",")[0];
  const lon=data[0].split(",")[1];
  const building=data[0].split(",")[2];
  const floor=data[0].split(",")[3];
  const SSID=data[0].split(",")[4];
  const IP=data[0].split(",")[5];
  await query(`UPDATE users SET lat='${lat}', lon='${lon}', building='${building}', floor='${floor}', SSID='${SSID}', IP='${IP}' where user_id='${id}'`);
  
  res.json({
    lat : lat, lon : lon, building : building,
    floor : floor, SSID : SSID, IP : IP,
  });
  
});
router.get('/place', verifyMiddleWare, async(req, res, next) => {
  const { id } = req.decoded;
  console.log(id);
  const queryResult = await query(`SELECT distinct building, floor, SSID from users where not building is null and not floor is null and not SSID is null order by building asc, floor asc, SSID asc;`);
  res.json({queryResult})
});

router.post('/uploadFile', upload.single('attachment'), function(req,res){ // 4 
  console.log(req.file);
  res.render('confirmation', { file:req.file, files:null });
});

router.post('/uploadFileWithOriginalFilename', uploadWithOriginalFilename.single('attachment'), function(req,res){ // 5
  res.render('confirmation', { file:req.file, files:null });
});

router.post('/upload', async (req, res, next) => {
  console.log("==============");
  console.log(req.body);
  var dir = './uploadedFiles';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir); // 2
  
  
  res.json({
    success : true,
  });

}); 

module.exports = router;


