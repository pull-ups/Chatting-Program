const cookie = require('cookie');
const { verify } = require('../modules/jwt');
const { query } = require('../modules/db');
const cryptr = require('../modules/jwt');

const getIdAndName = socket => socket.handshake.headers['cookie'] && cookie.parse(socket.handshake.headers['cookie']).token && verify(cookie.parse(socket.handshake.headers['cookie']).token) || {};
const updateOnlineList = (io, roomName) => {
	const roomPeople = io.sockets.adapter.rooms.get(roomName) ? Array.from(io.sockets.adapter.rooms.get(roomName)).map(socket_id => ({
		id: io.sockets.sockets.get(socket_id).user_id,
		name: io.sockets.sockets.get(socket_id).name,
	})) : [];

	// notification(알림) to people
	io.to(roomName).emit('UPDATE_ONLINE_USERS', roomPeople);
}

const findSocketById = (io, id) => {
	const sockets = [];
	for (let socket of io.sockets.sockets.values()) {
		if (socket.user_id === id) {
			sockets.push(socket);
		}
	}
	
	return sockets;
};

module.exports = io => {
	io.on('connection', socket => {
		const { id, name } = getIdAndName(socket);

		if (id) {
			findSocketById(io, id).map(socket => socket.disconnect());
			socket.user_id = id;
			socket.name = name;
			socket.join('online');
			updateOnlineList(io, 'online');
		} else {
			socket.disconnect();
		}

		socket.on('CHAT_MESSAGE', async msg => {
			const targetSockets = findSocketById(io, msg.targetId);
			const chatroom=await query(`SELECT chatid from chat_room where ((user1id = '${msg.targetId}') and (user2id = '${socket.user_id}')) or ((user2id = '${msg.targetId}') and (user1id = '${socket.user_id}'))`);
			if (chatroom.length==0){
				await query(`INSERT INTO chat_room(user1id, user2id) values ('${socket.user_id}', '${msg.targetId}' ) ;`)
			}
			if (!msg.expire_time){
				const encrtpyedmsg = cryptr.cryption.encrypt(msg.message);
				await query(`INSERT INTO message(senderid, receiverid, content, sendtime, chatid, noticed) SELECT f.user_id, t.user_id, '${encrtpyedmsg}', '${msg.created_at}', c.chatid, '${msg.noticed}' FROM users f, users t, chat_room c WHERE f.user_id = '${socket.user_id}' and t.user_id = '${msg.targetId}' and ((c.user1id = '${socket.user_id}' and c.user2id = '${msg.targetId}') or (c.user1id = '${msg.targetId}' and c.user2id = '${socket.user_id}'));`)
			}
			else{
				const encrtpyedmsg = cryptr.cryption.encrypt(msg.message);
				await query(`INSERT INTO message(senderid, receiverid, content, sendtime, chatid, expire_time, noticed, durtime) SELECT f.user_id, t.user_id, '${encrtpyedmsg}', '${msg.created_at}', c.chatid, '${msg.expire_time}', '${msg.noticed}', '${msg.durtime}' FROM users f, users t, chat_room c WHERE f.user_id = '${socket.user_id}' and t.user_id = '${msg.targetId}' and ((c.user1id = '${socket.user_id}' and c.user2id = '${msg.targetId}') or (c.user1id = '${msg.targetId}' and c.user2id = '${socket.user_id}'));`)
			}
			
			if (targetSockets.length > 0) {
				targetSockets.forEach(soc => soc.emit('CHAT_MESSAGE', {
					message: msg.message,
					from_id: socket.user_id,
					from_name: socket.name,
					created_at: msg.created_at,
					expire_time: msg.expire_time,
					noticed: msg.noticed
				}));
			}

			if (msg.durtime){
				const encrtpyeddeletedmsg = cryptr.cryption.encrypt("삭제된 메세지 입니다.");
				setTimeout(() => query(`UPDATE message SET content = '${encrtpyeddeletedmsg}' WHERE sendtime = '${msg.created_at}';`), msg.durtime * 60 * 1000);
			}
		});

		socket.on("disconnect", () => {0
			if (socket.user_id) {
				socket.leave('online');
				updateOnlineList(io, 'online');
				console.log(`LEAVE ONLINE ${socket.user_id}`);
			}
		});
	});
};