import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { mediasoupManager } from './mediasoupManager.js';

process.setMaxListeners(100);

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            const allowedOrigins = [
                "http://localhost:5173",
                "http://localhost:5174",
                "https://syncroom-theta.vercel.app",
                "http://localhost:5175",
                "http://localhost:5176",
                "http://localhost:3000"
            ];
            // Allow all Vercel deployments (preview & production) for ease of testing
            if (origin && origin.endsWith('.vercel.app')) {
                return callback(null, true);
            }
            if (process.env.CLIENT_URL) allowedOrigins.push(process.env.CLIENT_URL);

            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);

            if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
                callback(null, true);
            } else {
                // Check for Vercel preview deployments (dynamic subdomains)
                // Temporarily allow all for debugging if strict mode fails
                callback(null, true); // WARN: For production, tighten this!
            }
        },
        methods: ["GET", "POST"]
    },
    // Server-Side Heartbeat / Keep-Alive Configuration
    // Crucial for Render/Load Balancers to prevent idle timeouts
    pingInterval: 25000, // Send ping every 25s
    pingTimeout: 20000,   // Wait 20s for pong before closing
    transports: ['websocket'] // Force WebSocket only
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

    // Attach Mediasoup handlers
    mediasoupManager.handleSocket(socket, io);

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
            videoState: {
                currentTime: 0,
                isPlaying: false,
                playbackRate: 1,
                lastSyncTime: Date.now()
            },
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
        socket.userId = userId;
        socket.userName = userName;

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
        socket.userId = userId;
        socket.userName = userName;

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

        // Drift Compensation for Late Joiners (Authoritative Extrapolation)
        let extrapolatedTime = room.videoState.currentTime;
        if (room.videoState.isPlaying) {
            const elapsed = (Date.now() - room.videoState.lastSyncTime) / 1000;
            extrapolatedTime += (elapsed * room.videoState.playbackRate);
        }

        // Send Full Snapshot
        callback({
            success: true,
            room: {
                ...room,
                currentTime: extrapolatedTime,
                isPlaying: room.videoState.isPlaying,
                playbackRate: room.videoState.playbackRate
            }
        });

        // Force Sync for Member
        if (room.media && !isReconnect) {
            socket.emit('yt_sync_update', {
                currentTime: extrapolatedTime,
                isPlaying: room.videoState.isPlaying,
                playbackRate: room.videoState.playbackRate,
                timestamp: Date.now()
            });
        }

        // WEBRTC FIX: Trigger Renegotiation if Sharing is Active
        if (room.isSharing && room.activeSharerId && room.activeSharerId !== socket.id) {
            console.log(`[WebRTC] Notify Host (${room.activeSharerId}) about new joiner (${socket.id})`);
            // Note: In SFU mode, this is just for awareness; consumption is triggered by 'get_producers'
        }
    });

    // --------------------------------------
    // YOUTUBE EVENT HANDLER (Authoritative)
    // --------------------------------------
    socket.on('yt_event', (data) => {
        const { roomCode, type, payload } = data;
        const room = rooms.get(roomCode);

        if (!room) return;

        // Host only check
        const user = room.users.find(u => u.id === socket.id);
        if (!user || !user.isHost) return;

        // Update Server State
        if (payload.currentTime !== undefined) room.videoState.currentTime = payload.currentTime;
        if (payload.isPlaying !== undefined) room.videoState.isPlaying = payload.isPlaying;
        if (payload.playbackRate !== undefined) room.videoState.playbackRate = payload.playbackRate;

        room.videoState.lastSyncTime = Date.now();

        console.log(`[YouTube] Sync Event (${type}): ${roomCode} @ ${room.videoState.currentTime.toFixed(2)}s`);

        // Broadcast to everyone else (Absolute Update)
        socket.to(roomCode).emit('yt_sync_update', {
            ...room.videoState,
            timestamp: room.videoState.lastSyncTime
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
            replyTo: message.replyTo || null, // Store reply context
            isEdited: false,
            reactions: {} // Initialize empty reactions object
        };

        room.chat.push(newMessage);

        // Broadcast to all in room
        io.to(roomCode).emit('new_message', newMessage);
    });

    // --------------------------------------
    // EDIT MESSAGE
    // --------------------------------------
    socket.on('edit_message', (data) => {
        const { roomCode, messageId, newContent, userId } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        const message = room.chat.find(m => m.id === messageId);
        if (!message) return;

        // Verify ownership (or host?)
        // Assuming strict ownership for now, or host override
        const user = room.users.find(u => u.oderId === userId);
        const isHost = user?.isHost;

        if (message.senderId !== userId && !isHost) {
            return; // Unauthorized
        }

        // Update content
        message.content = newContent;
        message.isEdited = true;

        io.to(roomCode).emit('message_updated', {
            messageId,
            newContent,
            isEdited: true
        });
    });

    // --------------------------------------
    // DELETE MESSAGE
    // --------------------------------------
    socket.on('delete_message', (data) => {
        const { roomCode, messageId, userId } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        const messageIndex = room.chat.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return;

        const message = room.chat[messageIndex];

        // Verify ownership (or host)
        const user = room.users.find(u => u.oderId === userId);
        const isHost = user?.isHost;

        if (message.senderId !== userId && !isHost) {
            return; // Unauthorized
        }

        // Remove from chat
        room.chat.splice(messageIndex, 1);

        io.to(roomCode).emit('message_deleted', {
            messageId
        });
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
        if (isPlaying !== undefined) {
            room.isPlaying = isPlaying;
            room.videoState.isPlaying = isPlaying;
        }
        if (currentTime !== undefined) {
            room.currentTime = currentTime;
            room.videoState.currentTime = currentTime;
        }

        room.lastSyncTime = Date.now();
        room.videoState.lastSyncTime = Date.now();

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
    // --------------------------------------
    // SFU VOICE CHANNEL
    // --------------------------------------
    socket.on('join-voice', (data, callback) => {
        const { roomCode, userId } = data;
        const room = rooms.get(roomCode);
        if (!room) return callback?.({ error: 'Room not found' });

        const user = room.users.find(u => u.oderId === userId);
        if (!user) return callback?.({ error: 'User not found in room' });

        if (!room.voiceUsers.find(u => u.oderId === userId)) {
            room.voiceUsers.push({
                id: socket.id,
                oderId: userId,
                name: user.name,
                avatar: user.avatar,
                isSpeaking: false,
                isMuted: false,
                isDeafened: false,
                joinedAt: Date.now()
            });
        }

        // Notify others
        io.to(roomCode).emit('voice_users_update', room.voiceUsers);

        console.log(`[Voice] ${user.name} joined voice in ${roomCode}`);
        callback?.({ success: true });
    });

    socket.on('leave-voice', (data) => {
        const { roomCode, userId } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        room.voiceUsers = room.voiceUsers.filter(u => u.oderId !== userId);
        io.to(roomCode).emit('voice_users_update', room.voiceUsers);
        console.log(`[Voice] User ${userId} left voice in ${roomCode}`);
    });

    socket.on('speaking-status', (data) => {
        const { roomCode, userId, isSpeaking } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        const voiceUser = room.voiceUsers.find(u => u.oderId === userId);
        if (voiceUser) {
            voiceUser.isSpeaking = isSpeaking;
            // Broadcast to others to show indicator
            socket.to(roomCode).emit('user-speaking-update', { userId, isSpeaking });
        }
    });

    socket.on('voice_mute_update', (data) => {
        const { roomCode, userId, isMuted } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        const voiceUser = room.voiceUsers.find(u => u.oderId === userId);
        if (voiceUser) {
            voiceUser.isMuted = isMuted;
            socket.to(roomCode).emit('voice_user_mute_changed', { userId, isMuted });
            console.log(`[Voice] Mute changed: ${voiceUser.name} -> ${isMuted}`);
        }
    });

    socket.on('voice_deafen_update', (data) => {
        const { roomCode, userId, isDeafened } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        const voiceUser = room.voiceUsers.find(u => u.oderId === userId);
        if (voiceUser) {
            voiceUser.isDeafened = isDeafened;
            socket.to(roomCode).emit('voice_user_deafen_changed', { userId, isDeafened });
            console.log(`[Voice] Deafen changed: ${voiceUser.name} -> ${isDeafened}`);
        }
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

        // WEBRTC FIX: Track Sharing State
        room.isSharing = true;
        room.activeSharerId = socket.id; // Store SOCKET ID for direct signaling

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


    socket.on('screen_share_stop', (data) => {
        const { roomCode } = data;
        const room = rooms.get(roomCode);
        if (!room) return;
        room.media = null;
        room.isPlaying = false;

        // WEBRTC FIX: Clear Sharing State
        room.isSharing = false;
        room.activeSharerId = null;
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

    // Notify others about voice state
    io.to(roomCode).emit('voice_users_update', room.voiceUsers);

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
                // Also delete Mediasoup room if it exists
                if (mediasoupManager.rooms.has(roomCode)) {
                    const msRoom = mediasoupManager.rooms.get(roomCode);
                    msRoom.router.close();
                    mediasoupManager.rooms.delete(roomCode);
                    console.log(`[Mediasoup] Deleted empty room router: ${roomCode}`);
                }
                console.log(`[Room] Deleted empty room: ${roomCode}`);
            }
        }, 30000); // 30 seconds grace period
    }

    // Clean up Mediasoup peer state
    mediasoupManager.cleanupPeer(socket.id);

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

async function startServer() {
    console.log('[Server] Initializing Mediasoup...');
    try {
        await mediasoupManager.init();
        httpServer.listen(PORT, () => {
            console.log(`🚀 SyncRoom Server running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('[Server] Failed to initialize Mediasoup:', err);
        process.exit(1);
    }
}

startServer();
