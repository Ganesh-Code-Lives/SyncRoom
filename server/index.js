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
            "https://syncroom-theta.vercel.app",
            "http://localhost:5175",
            "http://localhost:5176",
            "http://localhost:3000"
        ],
        methods: ["GET", "POST"]
    },
    // Server-Side Heartbeat / Keep-Alive Configuration
    // Crucial for Render/Load Balancers to prevent idle timeouts
    pingInterval: 25000, // Send ping every 25s
    pingTimeout: 20000   // Wait 20s for pong before closing
});

// ============================================
// SERVER HEARTBEAT LOOP (Application Level)
// ============================================
// Keeps connections alive even if low-level pings are filtered/dropped
setInterval(() => {
    io.volatile.emit('server_heartbeat', { timestamp: Date.now() });
}, 30000); // 30s heartbeat

// ============================================
// IN-MEMORY ROOM STORAGE
// ============================================
const rooms = new Map();
const disconnectTimers = new Map(); // Track pending disconnects for debounce

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

        // Collision Check (Retries up to 3 times)
        let roomCode = generateRoomCode();
        let attempts = 0;
        while (rooms.has(roomCode) && attempts < 3) {
            roomCode = generateRoomCode();
            attempts++;
        }
        if (rooms.has(roomCode)) {
            return callback({ success: false, error: 'Server busy. Please try again.' });
        }

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
            lastSyncTime: Date.now(), // Authoritative server timestamp
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

        // Return SUCCESS with full snapshot
        callback({ success: true, roomCode, room });
    });

    // --------------------------------------
    // JOIN ROOM
    // --------------------------------------
    socket.on('join_room', (data, callback) => {
        const { roomCode, userId, userName, userAvatar } = data;

        const room = rooms.get(roomCode);

        // CRITICAL: Strict Existence Check
        // If room doesn't exist, Client MUST redirect.
        if (!room) {
            return callback({
                success: false,
                error: 'Room not found',
                redirect: true // Signal client to clear state and go home
            });
        }

        if (room.isLocked) {
            return callback({ success: false, error: 'Room is locked.' });
        }

        // Cancel deletion if scheduled
        if (room.deleteTimeout) {
            clearTimeout(room.deleteTimeout);
            room.deleteTimeout = null;
            console.log(`[Room] saved from deletion: ${roomCode}`);
        }

        // Cancel disconnect timer if user is reconnecting
        const disconnectKey = `${roomCode}-${userId}`;
        if (disconnectTimers.has(disconnectKey)) {
            clearTimeout(disconnectTimers.get(disconnectKey));
            disconnectTimers.delete(disconnectKey);
            console.log(`[Room] ${userName} reconnected, cancelled disconnect timer`);
        }

        // Check if user is already in the room
        const existingUser = room.users.find(u => u.oderId === userId);
        const isReconnect = !!existingUser;

        if (existingUser) {
            // Update socket ID for reconnection
            existingUser.id = socket.id;
        } else {
            room.users.push({
                id: socket.id,
                oderId: userId,
                name: userName,
                avatar: userAvatar,
                isHost: false, // NEVER auto-host on join (unless created)
                joinedAt: Date.now()
            });
        }

        socket.join(roomCode);
        socket.roomCode = roomCode;

        // Notify others only if this is a new join (not reconnect)
        if (!isReconnect) {
            socket.to(roomCode).emit('user_joined', {
                userId,
                userName,
                userAvatar,
                socketId: socket.id
            });

            const systemMessage = {
                id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
                type: 'system',
                content: `${userName} joined`,
                timestamp: new Date().toISOString()
            };
            room.chat.push(systemMessage);
            io.to(roomCode).emit('new_message', systemMessage);
        }

        console.log(`[Room] ${userName} ${isReconnect ? 'reconnected to' : 'joined'}: ${roomCode}`);

        // Drift Compensation for Late Joiners
        let syncedCurrentTime = room.currentTime;
        if (room.isPlaying) {
            const elapsed = (Date.now() - room.lastSyncTime) / 1000;
            syncedCurrentTime += elapsed;
        }

        // Send Full Snapshot
        callback({
            success: true,
            room: {
                ...room,
                currentTime: syncedCurrentTime
            }
        });

        // Force Sync for Member
        if (room.media && !isReconnect) {
            socket.emit('playback_sync', {
                action: 'late_join_sync',
                media: room.media,
                isPlaying: room.isPlaying,
                currentTime: syncedCurrentTime,
                serverTime: Date.now()
            });
        }
    });

    // --------------------------------------
    // YOUTUBE TIME SYNC (New - Heartbeat)
    // --------------------------------------
    socket.on('yt_time_update', (data) => {
        const { roomCode, currentTime, isPlaying, timestamp } = data;
        const room = rooms.get(roomCode);

        // Validation: Room exists & Sender is Host
        if (!room || room.hostId !== socket.roomUserId) return; // socket.roomUserId needs setting in join
        // Alternatively, use socket.id and check vs room.hostId logic below (safer if we don't stamp socket)
        const user = room.users.find(u => u.id === socket.id);
        if (!user || !user.isHost) return;

        // Update Server State
        room.currentTime = currentTime;
        room.isPlaying = isPlaying;
        room.lastSyncTime = Date.now(); // Server's own authoritative timestamp

        // Broadcast to everyone else (Except Host)
        // Client uses `timestamp` (Host's time) for latency calculation
        socket.to(roomCode).emit('yt_time_update', {
            currentTime,
            isPlaying,
            timestamp // High-precision timestamp from Host (used for drift calc)
        });
    });


    // --------------------------------------
    // LEAVE ROOM
    // --------------------------------------
    socket.on('leave_room', () => {
        handleUserLeave(socket);
    });

    // ... (SEND MESSAGE, REACTIONS - Unchanged) ...

    // --------------------------------------
    // SEND MESSAGE
    // --------------------------------------
    socket.on('send_message', (data) => {
        const { roomCode, message } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        const newMessage = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${socket.id.substr(0, 6)}`,
            senderId: message.senderId,
            senderName: message.senderName,
            senderAvatar: message.senderAvatar,
            content: message.content,
            timestamp: new Date().toISOString(),
            type: 'user',
            reactions: {} // Initialize empty reactions object
        };

        room.chat.push(newMessage);

        // Broadcast to all in room
        io.to(roomCode).emit('new_message', newMessage);
    });

    // --------------------------------------
    // MESSAGE REACTIONS
    // --------------------------------------
    socket.on('add_message_reaction', (data) => {
        const { roomCode, messageId, emoji, userId } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        const message = room.chat.find(m => m.id === messageId);
        if (!message) return;

        // Initialize reactions if not exists
        if (!message.reactions) message.reactions = {};

        // Initialize emoji count if not exists
        if (!message.reactions[emoji]) {
            message.reactions[emoji] = { count: 0, users: [] };
        }

        // Check if user already reacted with this emoji
        const userIndex = message.reactions[emoji].users.indexOf(userId);
        if (userIndex === -1) {
            // Add reaction
            message.reactions[emoji].count++;
            message.reactions[emoji].users.push(userId);
        } else {
            // Remove reaction (toggle)
            message.reactions[emoji].count--;
            message.reactions[emoji].users.splice(userIndex, 1);
            // Clean up if count is 0
            if (message.reactions[emoji].count === 0) {
                delete message.reactions[emoji];
            }
        }

        // Broadcast updated message to all users
        io.to(roomCode).emit('message_reaction_update', {
            messageId,
            reactions: message.reactions
        });
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
            // console.log(`[Playback] Rejected - ${userId} is not host`);
            return;
        }

        // Update room state
        if (media !== undefined) {
            room.media = media;
            console.log(`[Playback] Media updated:`, media ? media.type : 'null');
        }
        if (isPlaying !== undefined) room.isPlaying = isPlaying;
        if (currentTime !== undefined) room.currentTime = currentTime;

        room.lastSyncTime = Date.now();

        // Broadcast to all clients
        io.to(roomCode).emit('playback_sync', {
            action,
            media: room.media,
            isPlaying: room.isPlaying,
            currentTime: room.currentTime,
            serverTime: Date.now()
        });
    });

    // ... (SYNC REQUEST, HOST CONTROLS - Unchanged) ...
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

        const lockMessage = {
            id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
            type: 'system',
            content: room.isLocked ? 'Room has been locked' : 'Room has been unlocked',
            timestamp: new Date().toISOString()
        };
        room.chat.push(lockMessage);
        io.to(roomCode).emit('new_message', lockMessage);
    });

    socket.on('kick_user', (data) => {
        const { roomCode, hostId, targetUserId, targetUserName } = data;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== hostId) return;

        const targetSocket = room.users.find(u => u.oderId === targetUserId);
        if (targetSocket) {
            io.to(targetSocket.id).emit('kicked');

            // Force socket leave
            const socketInstance = io.sockets.sockets.get(targetSocket.id);
            if (socketInstance) {
                socketInstance.leave(roomCode);
            }

            room.users = room.users.filter(u => u.oderId !== targetUserId);
            room.voiceUsers = room.voiceUsers.filter(u => u.oderId !== targetUserId);
            io.to(roomCode).emit('voice_users_update', room.voiceUsers);

            const kickMessage = {
                id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
                type: 'system',
                content: `${targetUserName} was kicked from the room`,
                timestamp: new Date().toISOString()
            };
            room.chat.push(kickMessage);
            io.to(roomCode).emit('new_message', kickMessage);
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
        const transferMessage = {
            id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
            type: 'system',
            content: `Host role transferred to ${targetUser.name}`,
            timestamp: new Date().toISOString()
        };
        room.chat.push(transferMessage);
        io.to(roomCode).emit('new_message', transferMessage);

        // Broadcast Member/Host Update
        io.to(roomCode).emit('host_update', {
            newHostId: targetUserId,
            users: room.users
        });

        console.log(`[Room] Host transferred in ${roomCode} to ${targetUser.name}`);
    });


    // ... (VOICE, SCREEN, EMOJI - Unchanged) ...
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

        // UPDATE STATE
        room.media = {
            type: 'shared',
            url: null,
            hostId: userId,
            startedAt: Date.now()
        };
        room.isPlaying = true; // Considered "playing" when sharing

        const screenShareStartMessage = {
            id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
            type: 'system',
            content: 'Host started screen sharing',
            timestamp: new Date().toISOString()
        };
        room.chat.push(screenShareStartMessage);
        io.to(roomCode).emit('new_message', screenShareStartMessage);

        socket.to(roomCode).emit('screen_share_started', { hostSocketId: socket.id });

        // Also emit playback update so clients switch modes if they are on Youtube
        io.to(roomCode).emit('playback_update', {
            action: 'media_change',
            media: room.media,
            isPlaying: true,
            currentTime: 0,
            serverTime: Date.now()
        });
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
        const screenShareStopMessage = {
            id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
            type: 'system',
            content: 'Host stopped screen sharing. Returning to media selection.',
            timestamp: new Date().toISOString()
        };
        room.chat.push(screenShareStopMessage);
        io.to(roomCode).emit('new_message', screenShareStopMessage);
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
    // EMOJI REACTIONS
    // --------------------------------------
    socket.on('send_reaction', (data) => {
        const { roomCode, emoji, userId, userName } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        // Broadcast reaction to all users in room
        io.to(roomCode).emit('reaction_received', {
            emoji,
            userId,
            userName,
            timestamp: Date.now()
        });
    });

    // ... (DISCONNECT) ...
    // --------------------------------------
    // DISCONNECT (with 3s debounce for page reloads)
    // --------------------------------------
    socket.on('disconnect', () => {
        console.log(`[Socket] User disconnected: ${socket.id}`);

        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const user = room.users.find(u => u.id === socket.id);
        if (!user) return;

        // Set 3-second debounce timer before confirming disconnect
        const disconnectKey = `${roomCode}-${user.oderId}`;
        const timer = setTimeout(() => {
            handleUserLeave(socket);
            disconnectTimers.delete(disconnectKey);
        }, 3000); // 3 second grace period for quick reloads

        disconnectTimers.set(disconnectKey, timer);
        console.log(`[Socket] Set disconnect timer for ${user.name} (3s grace period)`);
    });
});

// Helper: Handle user leaving
function handleUserLeave(socket) {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const user = room.users.find(u => u.id === socket.id);
    if (!user) {
        // Debug: Why is user not found?
        // console.log(`[Leave] User not found for socket ${socket.id} in room ${roomCode}`);
        socket.leave(roomCode);
        return;
    }

    console.log(`[Leave] Processing leave for ${user.name} (${user.oderId}) from ${roomCode}`);
    console.log(`[Leave] Before removal: ${room.users.map(u => `${u.name}(${u.id})`).join(', ')}`);

    // 1. Remove User FIRST (Correct Logic)
    room.users = room.users.filter(u => u.id !== socket.id);
    room.voiceUsers = room.voiceUsers.filter(u => u.id !== socket.id);

    console.log(`[Leave] After removal: ${room.users.map(u => `${u.name}(${u.id})`).join(', ')}`);

    // Notify others
    io.to(roomCode).emit('user_left', {
        userId: user.oderId,
        userName: user.name
    });

    const leaveMessage = {
        id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
        type: 'system',
        content: `${user.name} left the room`,
        timestamp: new Date().toISOString()
    };
    room.chat.push(leaveMessage);
    io.to(roomCode).emit('new_message', leaveMessage);

    console.log(`[Room] ${user.name} left: ${roomCode}. Remaining: ${room.users.length}`);

    // 2. Host Transfer (If user was host AND room not empty)
    if (user.isHost && room.users.length > 0) {
        // Sort by joinedAt (Oldest member first)
        const nextHost = room.users.sort((a, b) => a.joinedAt - b.joinedAt)[0];

        if (nextHost) {
            console.log(`[Room] Host ${user.name} left. Transferring to ${nextHost.name}`);

            room.hostId = nextHost.oderId;
            room.hostName = nextHost.name;

            // Update flags in user list
            room.users = room.users.map(u => ({
                ...u,
                isHost: u.oderId === nextHost.oderId
            }));

            // Notify Room
            const hostMsg = {
                id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
                type: 'system',
                content: `Host role transferred to ${nextHost.name}`,
                timestamp: new Date().toISOString()
            };
            room.chat.push(hostMsg);
            io.to(roomCode).emit('new_message', hostMsg);

            io.to(roomCode).emit('host_update', {
                newHostId: nextHost.oderId,
                users: room.users
            });
        }
    } else if (user.isHost && room.users.length === 0) {
        // If host left and no one else -> Pause Playback immediately?
        // Actually, if empty, it will be deleted soon anyway.
        // But good to clean up state.
        room.isPlaying = false;
    }

    // 3. Clean up empty rooms
    if (room.users.length === 0) {
        console.log(`[Room] Empty: ${roomCode}. Deleting in 30s if no one joins...`);
        room.deleteTimeout = setTimeout(() => {
            // Re-check existence and emptiness
            if (rooms.has(roomCode) && rooms.get(roomCode).users.length === 0) {
                rooms.delete(roomCode);
                console.log(`[Room] Deleted empty room: ${roomCode}`);
            }
        }, 30000); // 30 seconds grace period
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
