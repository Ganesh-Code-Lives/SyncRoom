import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { socket } from '../lib/socket';

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
    const { error: showError, success: showSuccess, info: showInfo } = useToast();
    const { user, isGuest } = useAuth();
    const navigate = useNavigate();

    // Room State
    const [room, setRoom] = useState(null);
    const [currentMedia, setCurrentMedia] = useState(null);
    const [playback, setPlayback] = useState({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
    });
    const [chat, setChat] = useState([]);
    const [participants, setParticipants] = useState([]);
    const [voiceParticipants, setVoiceParticipants] = useState([]);
    const [isLocked, setIsLocked] = useState(false);
    const [isHost, setIsHost] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    const playerRef = useRef(null);

    // Get current user info for socket events
    const getUserInfo = useCallback(() => {
        try {
            return {
                oderId: user?.uid || `guest-${Date.now()}`,
                userName: user?.displayName || (isGuest ? 'Guest' : 'Anonymous'),
                userAvatar: user?.photoURL || null
            };
        } catch (e) {
            console.error("Error getting user info:", e);
            return { oderId: 'error', userName: 'Error', userAvatar: null };
        }
    }, [user, isGuest]);

    // Sync isHost state with room data
    useEffect(() => {
        if (room && user) {
            const { oderId } = getUserInfo();
            setIsHost(room.hostId === oderId);
        }
    }, [room?.hostId, user, getUserInfo]);

    // ============================================
    // SOCKET CONNECTION & LISTENERS
    // ============================================
    useEffect(() => {
        // Connect to server
        socket.connect();

        socket.on('connect', () => {
            console.log('[Socket] Connected:', socket.id);
            setIsConnected(true);
            setConnectionError(null);

            // AUTO-REJOIN: If we have a room in state, try to rejoin on reconnect
            setRoom(currentRoom => {
                if (currentRoom?.code) {
                    console.log('[Socket] Attempting to REJOIN room:', currentRoom.code);
                    const { oderId, userName, userAvatar } = getUserInfo();
                    socket.emit('join_room', {
                        roomCode: currentRoom.code,
                        userId: oderId,
                        userName,
                        userAvatar
                    }, (response) => {
                        if (response.success) console.log('[Socket] Rejoined successfully');
                        else console.error('[Socket] Failed to rejoin:', response.error);
                    });
                }
                return currentRoom;
            });
        });

        socket.on('disconnect', () => {
            console.log('[Socket] Disconnected');
            setIsConnected(false);
        });

        socket.on('connect_error', (error) => {
            console.error('[Socket] Connection error:', error);
            showError('Failed to connect to server');
            setConnectionError('Failed to connect to server');
        });

        // Room events
        socket.on('user_joined', (data) => {
            showInfo(`${data.userName} joined`);
            setParticipants(prev => {
                if (prev.find(p => p.oderId === data.userId)) return prev;
                return [...prev, {
                    id: data.socketId || socket.id,
                    oderId: data.userId,
                    name: data.userName,
                    avatar: data.userAvatar,
                    isHost: false
                }];
            });
        });

        socket.on('user_left', (data) => {
            // We can't easily get the name here without looking up, but strict ID check is fine
            // Ideally we'd look up name from participants before filtering
            setParticipants(prev => {
                const user = prev.find(p => p.oderId === data.userId);
                if (user) showInfo(`${user.name} left`);
                return prev.filter(p => p.oderId !== data.userId);
            });
        });

        socket.on('new_message', (message) => {
            setChat(prev => [...prev, message]);
        });

        socket.on('playback_sync', (data) => {
            setCurrentMedia(data.media);
            setPlayback(prev => ({
                ...prev,
                isPlaying: data.isPlaying,
                currentTime: data.currentTime,
                lastSyncTime: data.serverTime,
                lastAction: data.action // Used by MediaPlayer to trigger seeks/plays
            }));

            // Note: Drift correction is now handled in MediaPlayer.jsx
        });

        socket.on('room_locked', (data) => {
            setIsLocked(data.isLocked);
            showInfo(data.isLocked ? "Room Locked" : "Room Unlocked");
        });

        socket.on('kicked', () => {
            setRoom(null);
            setParticipants([]);
            setChat([]);
            navigate('/');
            showError('You have been kicked from the room.');
        });

        socket.on('voice_users_update', (users) => {
            setVoiceParticipants(users);
        });

        socket.on('host_update', (data) => {
            const { newHostId, users } = data;
            setRoom(prev => prev ? { ...prev, hostId: newHostId } : null);
            setParticipants(users);

            const newHost = users.find(u => u.oderId === newHostId);
            if (newHost) showSuccess(`Host transferred to ${newHost.name}`);

            // Re-evaluate local host status
            // We need to check against local socket/user ID
            // Since we don't have easy access to local ID inside this callback without refs or dependency
            // But 'users' list update triggers re-render where 'currentUser' is calculated.
            // However, isHost state needs explicit update if we want it to be fast.
            // Better: use useEffect to sync isHost with room.hostId
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('connect_error');
            socket.off('user_joined');
            socket.off('user_left');
            socket.off('new_message');
            socket.off('playback_sync');
            socket.off('room_locked');
            socket.off('kicked');
            socket.off('voice_users_update');
            socket.off('host_update');
            socket.disconnect();
        };
    }, [navigate]);

    // ============================================
    // ROOM ACTIONS
    // ============================================
    const createRoom = useCallback((name, type = 'video', privacy = 'public') => {
        return new Promise((resolve, reject) => {
            if (!user || isGuest) {
                reject(new Error('You must be logged in to create a room.'));
                return;
            }

            const { oderId, userName, userAvatar } = getUserInfo();

            socket.emit('create_room', {
                userId: oderId,
                userName,
                userAvatar,
                roomName: name,
                roomType: type,
                privacy
            }, (response) => {
                if (response.success) {
                    const roomData = response.room;
                    setRoom({
                        code: response.roomCode,
                        name: roomData.roomName,
                        type: roomData.roomType,
                        hostId: roomData.hostId
                    });
                    setIsHost(true);
                    setParticipants(roomData.users.map(u => ({
                        ...u,
                        isHost: u.oderId === roomData.hostId
                    })));
                    setChat(roomData.chat || []);
                    resolve(response.roomCode);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }, [user, isGuest, getUserInfo]);

    const joinRoom = useCallback((code) => {
        return new Promise((resolve, reject) => {
            const { oderId, userName, userAvatar } = getUserInfo();

            socket.emit('join_room', {
                roomCode: code.toUpperCase(),
                userId: oderId,
                userName,
                userAvatar
            }, (response) => {
                if (response.success) {
                    const roomData = response.room;
                    setRoom({
                        code: roomData.roomId,
                        name: roomData.roomName,
                        type: roomData.roomType,
                        hostId: roomData.hostId
                    });
                    setIsHost(roomData.hostId === oderId);
                    setParticipants(roomData.users.map(u => ({
                        ...u,
                        isHost: u.oderId === roomData.hostId
                    })));
                    setChat(roomData.chat || []);
                    setCurrentMedia(roomData.media);
                    setPlayback({
                        isPlaying: roomData.isPlaying,
                        currentTime: roomData.currentTime,
                        duration: 0
                    });
                    setIsLocked(roomData.isLocked);
                    resolve(roomData);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }, [getUserInfo]);

    const leaveRoom = useCallback(() => {
        socket.emit('leave_room');
        setRoom(null);
        setParticipants([]);
        setChat([]);
        setCurrentMedia(null);
        setPlayback({ isPlaying: false, currentTime: 0, duration: 0 });
        setIsHost(false);
        setVoiceParticipants([]);
        navigate('/');
    }, [navigate]);

    // ============================================
    // CHAT
    // ============================================
    const sendMessage = useCallback((text) => {
        if (!room) return;
        const { oderId, userName, userAvatar } = getUserInfo();

        socket.emit('send_message', {
            roomCode: room.code,
            message: {
                senderId: oderId,
                senderName: userName,
                senderAvatar: userAvatar,
                content: text
            }
        });
    }, [room, getUserInfo]);

    // ============================================
    // PLAYBACK CONTROL (HOST ONLY)
    // ============================================
    const updatePlayback = useCallback((action, state = {}) => {
        if (!room || !isHost) return;
        const { oderId } = getUserInfo();

        // state contains { isPlaying, currentTime, media }
        socket.emit('update_playback', {
            roomCode: room.code,
            userId: oderId,
            action,
            ...state
        });
    }, [room, isHost, getUserInfo]);

    const setMedia = useCallback((mediaObject) => {
        if (!room || !isHost) return;
        const { oderId } = getUserInfo();

        const emitUpdate = (m) => {
            socket.emit('update_playback', {
                roomCode: room.code,
                userId: oderId,
                action: 'media_change',
                media: m,
                isPlaying: false,
                currentTime: 0
            });
        };

        // HARD RESET PIPELINE
        // 1. Stop current media (Force unmount of players)
        socket.emit('stop-sharing', { roomCode: room.code }); // Failsafe cleanup
        emitUpdate(null);

        // 2. Wait for browser to clear capture/iframe restrictions (Mandatory 50ms+)
        if (mediaObject) {
            setTimeout(() => {
                // ADD UNIQUE ID FOR REMOUNT
                const mediaWithId = {
                    ...mediaObject,
                    id: crypto.randomUUID()
                };
                emitUpdate(mediaWithId);
            }, 50);
        }
    }, [room, isHost, getUserInfo]);

    const clearMedia = useCallback(() => {
        if (!room || !isHost) return;
        const { oderId } = getUserInfo();

        socket.emit('stop-sharing', { roomCode: room.code });
        socket.emit('update_playback', {
            roomCode: room.code,
            userId: oderId,
            media: null,
            isPlaying: false,
            currentTime: 0
        });
    }, [room, isHost, getUserInfo]);

    // ============================================
    // HOST CONTROLS
    // ============================================
    const toggleLock = useCallback(() => {
        if (!room || !isHost) return;
        const { oderId } = getUserInfo();
        socket.emit('toggle_lock', { roomCode: room.code, userId: oderId });
    }, [room, isHost, getUserInfo]);

    const transferHost = useCallback((targetUserId) => {
        if (!room || !isHost) return;
        const { oderId } = getUserInfo();
        socket.emit('transfer_host', { roomCode: room.code, hostId: oderId, targetUserId });
    }, [room, isHost, getUserInfo]);

    const kickParticipant = useCallback((userId, userName) => {
        if (!room || !isHost) return;
        const { oderId } = getUserInfo();

        socket.emit('kick_user', {
            roomCode: room.code,
            hostId: oderId,
            targetUserId: userId,
            targetUserName: userName
        });
    }, [room, isHost, getUserInfo]);

    // ============================================
    // VOICE CHAT
    // ============================================
    const joinVoice = useCallback(() => {
        if (!room) return;
        const { oderId, userName } = getUserInfo();
        socket.emit('join_voice', { roomCode: room.code, userId: oderId, userName });
    }, [room, getUserInfo]);

    const leaveVoice = useCallback(() => {
        if (!room) return;
        const { oderId } = getUserInfo();
        socket.emit('leave_voice', { roomCode: room.code, userId: oderId });
    }, [room, getUserInfo]);

    // ============================================
    // SYNC REQUEST (For reconnection)
    // ============================================
    const requestSync = useCallback(() => {
        if (!room) return;
        socket.emit('sync_request', { roomCode: room.code }, (response) => {
            if (response.success) {
                setPlayback(prev => ({
                    ...prev,
                    isPlaying: response.state.isPlaying,
                    currentTime: response.state.currentTime
                }));
                if (playerRef.current) {
                    playerRef.current.seekTo(response.state.currentTime, 'seconds');
                }
            }
        });
    }, [room]);

    // ============================================
    // PLAYLIST (MOCK Implementation for now)
    // ============================================
    const [playlist, setPlaylist] = useState([]);

    const addToQueue = useCallback((mediaItem) => {
        setPlaylist(prev => [...prev, mediaItem]);
    }, []);

    const removeFromQueue = useCallback((index) => {
        setPlaylist(prev => prev.filter((_, i) => i !== index));
    }, []);

    const voteSkip = useCallback(() => {
        console.log("Vote skip triggered");
    }, []);

    const currentUser = participants.find(p => p.id === socket.id) || {
        id: socket.id,
        oderId: user?.uid,
        name: user?.displayName || (isGuest ? 'Guest' : 'Anonymous'),
        avatar: user?.photoURL,
        isHost: isHost
    };

    // ============================================
    // CONTEXT VALUE
    // ============================================
    const value = {
        // State
        room,
        currentUser, // Added this
        currentMedia,
        playback,
        chat,
        participants,
        voiceParticipants,
        isLocked,
        isHost,
        isConnected,
        connectionError,
        playerRef,
        playlist, // Added this

        // Room Actions
        createRoom,
        joinRoom,
        leaveRoom,

        // Chat
        sendMessage,

        // Playback (Host Only)
        updatePlayback,
        setMedia,
        clearMedia,

        // Host Controls
        toggleLock,
        kickParticipant,
        transferHost,

        // Voice
        joinVoice,
        leaveVoice,

        // Playlist
        addToQueue,
        removeFromQueue,
        voteSkip,

        // Sync
        requestSync,

        // Reactions (Mock)
        activeReaction: null,
        sendReaction: () => { },
        addMessageReaction: () => { },
        muteParticipant: () => { }
    };

    return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};
