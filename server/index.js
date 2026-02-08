import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:5175",
            "http://localhost:5176",
            "http://localhost:3000"
        ],
        methods: ["GET", "POST"]
    }
});

// ============================================
// IN-MEMORY ROOM STORAGE
// ============================================
const rooms = new Map();

// Generate unique 6-character room code
const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// ============================================
// SOCKET.IO CONNECTION HANDLER
// ============================================
io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    // --------------------------------------
    // CREATE ROOM
    // --------------------------------------
    socket.on('create_room', (data, callback) => {
        const { userId, userName, userAvatar, roomName, roomType, privacy } = data;

        if (!userId) {
            return callback({ success: false, error: 'Authentication required to create a room.' });
        }

        const roomCode = generateRoomCode();

        const room = {
            roomId: roomCode,
            roomName: roomName || 'New Room',
            roomType: roomType || 'video',
            privacy: privacy || 'public',
            hostId: userId,
            hostName: userName,
            media: null,
            isPlaying: false,
            currentTime: 0,
            lastSyncTime: Date.now(),
            isLocked: false,
            users: [{
                id: socket.id,
                oderId: userId,
                name: userName,
                avatar: userAvatar,
                isHost: true,
                joinedAt: Date.now()
            }],
            chat: [],
            voiceUsers: []
        };

        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;

        console.log(`[Room] Created: ${roomCode} by ${userName}`);

        callback({ success: true, roomCode, room });
    });

    // --------------------------------------
    // JOIN ROOM
    // --------------------------------------
    socket.on('join_room', (data, callback) => {
        const { roomCode, userId, userName, userAvatar } = data;

        const room = rooms.get(roomCode);

        if (!room) {
            return callback({ success: false, error: 'Invalid room code. Room does not exist.' });
        }

        if (room.isLocked) {
            return callback({ success: false, error: 'Room is locked. Cannot join.' });
        }

        // Cancel deletion if scheduled
        if (room.deleteTimeout) {
            clearTimeout(room.deleteTimeout);
            room.deleteTimeout = null;
            console.log(`[Room] saved from deletion: ${roomCode}`);
        }

        // Check if user is already in the room
        const existingUser = room.users.find(u => u.oderId === userId);
        if (existingUser) {
            // Update socket ID for reconnection
            existingUser.id = socket.id;
        } else {
            room.users.push({
                id: socket.id,
                oderId: userId,
                name: userName,
                avatar: userAvatar,
                isHost: false,
                joinedAt: Date.now()
            });
        }

        socket.join(roomCode);
        socket.roomCode = roomCode;

        // Notify others (include socketId for WebRTC screen share)
        socket.to(roomCode).emit('user_joined', {
            userId,
            userName,
            userAvatar,
            socketId: socket.id
        });

        // Add system message
        room.chat.push({
            id: Date.now(),
            type: 'system',
            content: `${userName} joined the room`
        });

        console.log(`[Room] ${userName} joined: ${roomCode}`);

        callback({ success: true, room });
    });

    // --------------------------------------
    // LEAVE ROOM
    // --------------------------------------
    socket.on('leave_room', () => {
        handleUserLeave(socket);
    });

    // --------------------------------------
    // SEND MESSAGE
    // --------------------------------------
    socket.on('send_message', (data) => {
        const { roomCode, message } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        const newMessage = {
            id: Date.now(),
            senderId: message.senderId,
            senderName: message.senderName,
            senderAvatar: message.senderAvatar,
            content: message.content,
            timestamp: new Date().toISOString(),
            type: 'user'
        };

        room.chat.push(newMessage);

        // Broadcast to all in room
        io.to(roomCode).emit('new_message', newMessage);
    });

    // --------------------------------------
    // UPDATE PLAYBACK (HOST ONLY)
    // --------------------------------------
    socket.on('update_playback', (data) => {
        const { roomCode, userId, action, media, isPlaying, currentTime } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        // Verify host
        if (room.hostId !== userId) {
            console.log(`[Playback] Rejected - ${userId} is not host`);
            return;
        }

        // Update room state
        if (media !== undefined) room.media = media;
        if (isPlaying !== undefined) room.isPlaying = isPlaying;

        // Update time if provided
        if (currentTime !== undefined) {
            room.currentTime = currentTime;
        }

        room.lastSyncTime = Date.now();

        // Broadcast to all clients (including host to confirm)
        io.to(roomCode).emit('playback_sync', {
            action, // 'play', 'pause', 'seek', 'media_change'
            media: room.media,
            isPlaying: room.isPlaying,
            currentTime: room.currentTime,
            serverTime: Date.now()
        });

        console.log(`[Playback] Room ${roomCode}: action=${action}, isPlaying=${room.isPlaying}, time=${room.currentTime}`);
    });

    // --------------------------------------
    // SYNC REQUEST (Get current state)
    // --------------------------------------
    socket.on('sync_request', (data, callback) => {
        const { roomCode } = data;
        const room = rooms.get(roomCode);
        if (!room) {
            return callback({ success: false, error: 'Room not found' });
        }

        // Calculate current time based on elapsed time if playing
        let currentTime = room.currentTime;
        if (room.isPlaying) {
            const elapsed = (Date.now() - room.lastSyncTime) / 1000;
            currentTime += elapsed;
        }

        callback({
            success: true,
            state: {
                media: room.media,
                isPlaying: room.isPlaying,
                currentTime,
                serverTime: Date.now()
            }
        });
    });

    // --------------------------------------
    // HOST CONTROLS (Lock, Kick, Mute)
    // --------------------------------------
    socket.on('toggle_lock', (data) => {
        const { roomCode, userId } = data;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== userId) return;

        room.isLocked = !room.isLocked;
        io.to(roomCode).emit('room_locked', { isLocked: room.isLocked });

        room.chat.push({
            id: Date.now(),
            type: 'system',
            content: room.isLocked ? 'Room has been locked' : 'Room has been unlocked'
        });
        io.to(roomCode).emit('new_message', room.chat[room.chat.length - 1]);
    });

    socket.on('kick_user', (data) => {
        const { roomCode, hostId, targetUserId, targetUserName } = data;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== hostId) return;

        const targetSocket = room.users.find(u => u.oderId === targetUserId);
        if (targetSocket) {
            io.to(targetSocket.id).emit('kicked');
            room.users = room.users.filter(u => u.oderId !== targetUserId);

            room.chat.push({
                id: Date.now(),
                type: 'system',
                content: `${targetUserName} was kicked from the room`
            });
            io.to(roomCode).emit('new_message', room.chat[room.chat.length - 1]);
            io.to(roomCode).emit('user_left', { userId: targetUserId, userName: targetUserName });
        }
    });

    socket.on('transfer_host', (data) => {
        const { roomCode, hostId, targetUserId } = data;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== hostId) return;

        const targetUser = room.users.find(u => u.oderId === targetUserId);
        if (!targetUser) return;

        // Update Host ID
        room.hostId = targetUserId;
        room.hostName = targetUser.name;

        // Update Users List Flags
        room.users = room.users.map(u => ({
            ...u,
            isHost: u.oderId === targetUserId
        }));

        // Broadcast System Message
        room.chat.push({
            id: Date.now(),
            type: 'system',
            content: `Host role transferred to ${targetUser.name}`
        });
        io.to(roomCode).emit('new_message', room.chat[room.chat.length - 1]);

        // Broadcast Member/Host Update
        io.to(roomCode).emit('host_update', {
            newHostId: targetUserId,
            users: room.users
        });

        console.log(`[Room] Host transferred in ${roomCode} to ${targetUser.name}`);
    });

    // --------------------------------------
    // VOICE CHAT SIGNALING (WebRTC)
    // --------------------------------------
    socket.on('join_voice', (data) => {
        const { roomCode, userId, userName } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        if (!room.voiceUsers.find(u => u.oderId === userId)) {
            room.voiceUsers.push({ id: socket.id, oderId: userId, name: userName });
        }
        io.to(roomCode).emit('voice_users_update', room.voiceUsers);
    });

    socket.on('leave_voice', (data) => {
        const { roomCode, userId } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        room.voiceUsers = room.voiceUsers.filter(u => u.oderId !== userId);
        io.to(roomCode).emit('voice_users_update', room.voiceUsers);
    });

    socket.on('voice_signal', (data) => {
        const { roomCode, targetSocketId, signal } = data;
        io.to(targetSocketId).emit('voice_signal', { from: socket.id, signal });
    });

    // --------------------------------------
    // SCREEN SHARE (Shared View Mode - Kosmi-style)
    // --------------------------------------
    socket.on('screen_share_start', (data) => {
        const { roomCode, userId } = data;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== userId) return;
        socket.to(roomCode).emit('screen_share_started', { hostSocketId: socket.id });
    });

    socket.on('screen_share_ready', (data) => {
        const { roomCode } = data;
        const room = rooms.get(roomCode);
        if (!room) return;
        const hostUser = room.users.find(u => u.oderId === room.hostId);
        if (!hostUser) return;
        io.to(hostUser.id).emit('screen_share_request_offer', { memberSocketId: socket.id });
    });

    socket.on('screen_share_offer', (data) => {
        const { to, offer } = data;
        io.to(to).emit('screen_share_offer', { from: socket.id, offer });
    });

    socket.on('screen_share_answer', (data) => {
        const { to, answer } = data;
        io.to(to).emit('screen_share_answer', { from: socket.id, answer });
    });

    socket.on('screen_share_ice', (data) => {
        const { to, candidate } = data;
        io.to(to).emit('screen_share_ice', { from: socket.id, candidate });
    });

    socket.on('screen_share_stop', (data) => {
        const { roomCode } = data;
        const room = rooms.get(roomCode);
        if (!room) return;
        room.media = null;
        room.isPlaying = false;
        room.chat.push({
            id: Date.now(),
            type: 'system',
            content: 'Host stopped screen sharing. Returning to media selection.'
        });
        io.to(roomCode).emit('new_message', room.chat[room.chat.length - 1]);
        io.to(roomCode).emit('screen_share_stopped');
        io.to(roomCode).emit('playback_sync', {
            action: 'media_change',
            media: null,
            isPlaying: false,
            currentTime: 0,
            serverTime: Date.now()
        });
    });

    // --------------------------------------
    // DISCONNECT
    // --------------------------------------
    socket.on('disconnect', () => {
        console.log(`[Socket] User disconnected: ${socket.id}`);
        handleUserLeave(socket);
    });
});

// Helper: Handle user leaving
function handleUserLeave(socket) {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const user = room.users.find(u => u.id === socket.id);
    if (user) {
        room.users = room.users.filter(u => u.id !== socket.id);
        room.voiceUsers = room.voiceUsers.filter(u => u.id !== socket.id);

        // Notify others
        socket.to(roomCode).emit('user_left', {
            userId: user.oderId,
            userName: user.name
        });

        room.chat.push({
            id: Date.now(),
            type: 'system',
            content: `${user.name} left the room`
        });
        socket.to(roomCode).emit('new_message', room.chat[room.chat.length - 1]);

        console.log(`[Room] ${user.name} left: ${roomCode}`);

        // If host leaves, pause playback
        if (user.isHost) {
            room.isPlaying = false;
            io.to(roomCode).emit('playback_update', {
                isPlaying: false,
                currentTime: room.currentTime,
                serverTime: Date.now()
            });
            room.chat.push({
                id: Date.now(),
                type: 'system',
                content: 'Host has left. Playback paused.'
            });
            io.to(roomCode).emit('new_message', room.chat[room.chat.length - 1]);
        }

        // Clean up empty rooms with grace period
        if (room.users.length === 0) {
            console.log(`[Room] Empty: ${roomCode}. Deleting in 30s if no one joins...`);
            room.deleteTimeout = setTimeout(() => {
                if (rooms.has(roomCode) && rooms.get(roomCode).users.length === 0) {
                    rooms.delete(roomCode);
                    console.log(`[Room] Deleted empty room: ${roomCode}`);
                }
            }, 30000); // 30 seconds grace period
        }
    }

    socket.leave(roomCode);
}

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/', (req, res) => {
    res.json({ status: 'SyncRoom Server Running', rooms: rooms.size });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`🚀 SyncRoom Server running on http://localhost:${PORT}`);
});
