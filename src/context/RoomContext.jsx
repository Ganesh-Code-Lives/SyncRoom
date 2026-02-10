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
    const [activeReaction, setActiveReaction] = useState(null);
    const [isRoomLoaded, setIsRoomLoaded] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('Initializing...'); // 'Initializing' | 'Connecting' | 'Rejoining' | 'Ready'
    const [playlist, setPlaylist] = useState([]);

    const playerRef = useRef(null);

    // Get current user info for socket events
    const getUserInfo = useCallback(() => {
        try {
            // Persist guest ID in session storage to survive reloads
            let guestId = sessionStorage.getItem('syncroom_guest_id');
            if (!guestId) {
                guestId = `guest-${Date.now()}`;
                sessionStorage.setItem('syncroom_guest_id', guestId);
            }

            return {
                oderId: user?.uid || guestId,
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

        const handleConnect = () => {
            console.log('[Socket] Connected:', socket.id);
            setIsConnected(true);
            setConnectionError(null);

            // AUTO-REJOIN: If we have a room in state, try to rejoin on reconnect
            // AUTO-REJOIN: Check session storage for a room code if none is in state
            const storedRoomCode = sessionStorage.getItem('syncroom_last_room');
            if (storedRoomCode) {
                console.log('[Socket] Found stored room code, attempting REJOIN:', storedRoomCode);
                setLoadingStatus('Rejoining room...');

                const { oderId, userName, userAvatar } = getUserInfo();

                // FAILSAFE: 8s limit for join response
                let timeoutFired = false;
                const joinTimeout = setTimeout(() => {
                    timeoutFired = true;
                    console.warn('[Socket] Join timeout - clearing state and redirecting');
                    sessionStorage.removeItem('syncroom_last_room');
                    setIsRoomLoaded(true);
                    setLoadingStatus('Ready');
                    setRoom(null);
                    showError('Failed to rejoin room. Please try again.');
                    // Note: navigate would need to be imported if we want to redirect here
                    // For now, just clear the loading state and let Room.jsx handle redirect
                }, 8000);

                socket.emit('join_room', {
                    roomCode: storedRoomCode,
                    userId: oderId,
                    userName,
                    userAvatar
                }, (response) => {
                    // If timeout already fired, ignore this response
                    if (timeoutFired) return;

                    clearTimeout(joinTimeout); // Clear failsafe

                    if (response.success) {
                        console.log('[Socket] Auto-rejoin successful');
                        setLoadingStatus('Syncing state...');

                        // Manually trigger the state update logic that joinRoom uses
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
                        setVoiceParticipants(roomData.voiceUsers || []);
                        setChat(roomData.chat || []);
                        setCurrentMedia(roomData.media);
                        setPlayback({
                            isPlaying: roomData.isPlaying,
                            currentTime: roomData.currentTime,
                            duration: 0
                        });
                        setIsLocked(roomData.isLocked);
                        setIsRoomLoaded(true);
                        setLoadingStatus('Ready');
                    } else {
                        console.error('[Socket] Failed to auto-rejoin:', response.error);
                        sessionStorage.removeItem('syncroom_last_room');
                        setIsRoomLoaded(true); // Stop loading (will show error/home probably)
                        setLoadingStatus('Ready');
                        setRoom(null);
                        showError(response.error || 'Failed to rejoin room');
                    }
                });
            } else {
                setIsRoomLoaded(true);
                setLoadingStatus('Ready');
            }
        };

        const handleDisconnect = () => {
            console.log('[Socket] Disconnected');
            setIsConnected(false);
        };

        const handleConnectError = (error) => {
            console.error('[Socket] Connection error:', error);
            showError('Failed to connect to server');
            setConnectionError('Failed to connect to server');
        };

        const handleUserJoined = (data) => {
            console.log('[RoomContext] User joined:', data);
            showInfo(`${data.userName} joined`);
            setParticipants(prev => {
                // Check if user already exists
                const exists = prev.find(p => p.oderId === data.userId);
                if (exists) {
                    // Update existing user's socket ID if needed
                    if (exists.id !== data.socketId) {
                        return prev.map(p =>
                            p.oderId === data.userId
                                ? { ...p, id: data.socketId || socket.id }
                                : p
                        );
                    }
                    return prev;
                }
                // Add new participant
                return [...prev, {
                    id: data.socketId || socket.id,
                    oderId: data.userId,
                    name: data.userName,
                    avatar: data.userAvatar,
                    isHost: false
                }];
            });
        };

        const handleUserLeft = (data) => {
            setParticipants(prev => {
                const user = prev.find(p => p.oderId === data.userId);
                if (user) showInfo(`${user.name} left`);
                return prev.filter(p => p.oderId !== data.userId);
            });
        };

        const handleNewMessage = (message) => {
            console.log('[RoomContext] New message received:', message);
            setChat(prev => {
                // For system messages, only check ID duplicates
                if (message.type === 'system') {
                    if (prev.find(m => m.id === message.id)) {
                        console.log('[RoomContext] Duplicate system message filtered:', message.id);
                        return prev;
                    }
                    return [...prev, message];
                }

                // Check if this is a duplicate by ID first (most reliable)
                if (prev.find(m => m.id === message.id)) {
                    console.log('[RoomContext] Duplicate message filtered by ID:', message.id);
                    return prev;
                }

                // Check if this message should replace an optimistic message
                const currentUserId = user?.uid || sessionStorage.getItem('syncroom_guest_id');
                if (message.senderId === currentUserId) {
                    // Find optimistic message with same content from current user
                    const optimisticIndex = prev.findIndex(m =>
                        m.isOptimistic &&
                        m.senderId === message.senderId &&
                        m.content === message.content
                    );

                    if (optimisticIndex !== -1) {
                        console.log('[RoomContext] Replacing optimistic message with server message');
                        // Replace optimistic message with server message
                        const updated = [...prev];
                        updated[optimisticIndex] = message;
                        return updated;
                    }
                }

                console.log('[RoomContext] Adding new message to chat');
                return [...prev, message];
            });
        };

        const handlePlaybackSync = (data) => {
            console.log('[RoomContext] Playback sync received:', data);
            setCurrentMedia(data.media);
            setPlayback(prev => ({
                ...prev,
                isPlaying: data.isPlaying,
                currentTime: data.currentTime,
                lastSyncTime: data.serverTime,
                lastAction: data.action
            }));
            console.log('[RoomContext] Updated media to:', data.media);
        };

        const handleRoomLocked = (data) => {
            setIsLocked(data.isLocked);
            showInfo(data.isLocked ? "Room Locked" : "Room Unlocked");
        };

        const handleKicked = () => {
            sessionStorage.removeItem('syncroom_last_room');
            setRoom(null);
            setParticipants([]);
            setChat([]);
            navigate('/');
            showError('You have been kicked from the room.');
        };

        const handleVoiceUsersUpdate = (users) => {
            setVoiceParticipants(users);
        };

        const handleHostUpdate = (data) => {
            const { newHostId, users } = data;
            setRoom(prev => prev ? { ...prev, hostId: newHostId } : null);
            setParticipants(users);

            const newHost = users.find(u => u.oderId === newHostId);
            if (newHost) showSuccess(`Host transferred to ${newHost.name}`);
        };

        const handleReactionReceived = (data) => {
            setActiveReaction(data);
            // Clear reaction after 3 seconds
            setTimeout(() => setActiveReaction(null), 3000);
        };

        const handleMessageReactionUpdate = (data) => {
            const { messageId, reactions } = data;
            setChat(prev => prev.map(msg =>
                msg.id === messageId ? { ...msg, reactions } : msg
            ));
        };

        // Register all listeners
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        socket.on('user_joined', handleUserJoined);
        socket.on('user_left', handleUserLeft);
        socket.on('new_message', handleNewMessage);
        socket.on('playback_sync', handlePlaybackSync);
        socket.on('room_locked', handleRoomLocked);
        socket.on('kicked', handleKicked);
        socket.on('voice_users_update', handleVoiceUsersUpdate);
        socket.on('host_update', handleHostUpdate);
        socket.on('reaction_received', handleReactionReceived);
        socket.on('message_reaction_update', handleMessageReactionUpdate);

        return () => {
            // Remove all listeners
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('connect_error', handleConnectError);
            socket.off('user_joined', handleUserJoined);
            socket.off('user_left', handleUserLeft);
            socket.off('new_message', handleNewMessage);
            socket.off('playback_sync', handlePlaybackSync);
            socket.off('room_locked', handleRoomLocked);
            socket.off('kicked', handleKicked);
            socket.off('voice_users_update', handleVoiceUsersUpdate);
            socket.off('host_update', handleHostUpdate);
            socket.off('reaction_received', handleReactionReceived);
            socket.off('message_reaction_update', handleMessageReactionUpdate);
            socket.disconnect();
        };
    }, [navigate, getUserInfo, user, isRoomLoaded]); // Removed showError, showInfo, showSuccess - they're stable from ToastContext

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
                    sessionStorage.setItem('syncroom_last_room', response.roomCode);
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

                    // 1. Basic Room Data
                    setRoom({
                        code: roomData.roomId,
                        name: roomData.roomName,
                        type: roomData.roomType,
                        hostId: roomData.hostId
                    });
                    setIsHost(roomData.hostId === oderId);

                    // 2. Participants & Voice
                    setParticipants(roomData.users.map(u => ({
                        ...u,
                        isHost: u.oderId === roomData.hostId
                    })));
                    setVoiceParticipants(roomData.voiceUsers || []);

                    // 3. Chat & Media
                    setChat(roomData.chat || []);
                    console.log('[Join] Setting current media to:', roomData.media);
                    setCurrentMedia(roomData.media);

                    // 4. Playback State
                    setPlayback({
                        isPlaying: roomData.isPlaying,
                        currentTime: roomData.currentTime, // Server sends drift-corrected time
                        duration: 0
                    });
                    setIsLocked(roomData.isLocked);

                    // 5. Persistence for Auto-Rejoin
                    sessionStorage.setItem('syncroom_last_room', roomData.roomId);

                    // 6. Log join success
                    console.log('[Join] Room joined successfully. Media:', roomData.media, 'IsPlaying:', roomData.isPlaying);

                    setIsRoomLoaded(true);
                    resolve(roomData);
                } else {
                    setIsRoomLoaded(true);
                    reject(new Error(response.error));
                }
            });
        });
    }, [getUserInfo]);

    const leaveRoom = useCallback(() => {
        socket.emit('leave_room');
        sessionStorage.removeItem('syncroom_last_room');
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

        // Optimistic update - show message immediately
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimisticMessage = {
            id: tempId,
            senderId: oderId,
            senderName: userName,
            senderAvatar: userAvatar,
            content: text,
            timestamp: new Date().toISOString(),
            type: 'user',
            reactions: {},
            isOptimistic: true // Flag to identify temporary messages
        };

        setChat(prev => [...prev, optimisticMessage]);

        // Send to server
        socket.emit('send_message', {
            roomCode: room.code,
            message: {
                senderId: oderId,
                senderName: userName,
                senderAvatar: userAvatar,
                content: text
            }
        });

        // Replace optimistic message with server message when received
        // (handled in handleNewMessage by matching content + senderId)
    }, [room, getUserInfo, user]);

    const addMessageReaction = useCallback((messageId, emoji) => {
        if (!room) return;
        const { oderId } = getUserInfo();

        socket.emit('add_message_reaction', {
            roomCode: room.code,
            messageId,
            emoji,
            userId: oderId
        });
    }, [room, getUserInfo]);

    const sendReaction = useCallback((emoji) => {
        if (!room) return;
        const { oderId, userName } = getUserInfo();
        socket.emit('send_reaction', {
            roomCode: room.code,
            emoji,
            userId: oderId,
            userName
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

        if (mediaObject) {
            // Add unique ID for proper React re-rendering
            const mediaWithId = {
                ...mediaObject,
                id: crypto.randomUUID(),
                timestamp: Date.now() // Add timestamp for additional uniqueness
            };

            // Send media change directly (no null-first pattern)
            socket.emit('update_playback', {
                roomCode: room.code,
                userId: oderId,
                action: 'media_change',
                media: mediaWithId,
                isPlaying: false,
                currentTime: 0
            });

            console.log('[SetMedia] Sent media update:', mediaWithId);
        } else {
            // Only clear if explicitly setting to null
            socket.emit('update_playback', {
                roomCode: room.code,
                userId: oderId,
                action: 'media_clear',
                media: null,
                isPlaying: false,
                currentTime: 0
            });
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

    const muteParticipant = useCallback(() => {
        // TODO: Implement mute functionality
    }, []);

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

    const toggleVoice = useCallback(() => {
        const { oderId } = getUserInfo();
        const isInVoice = voiceParticipants.some(p => p.oderId === oderId);

        if (isInVoice) {
            leaveVoice();
        } else {
            joinVoice();
        }
    }, [voiceParticipants, getUserInfo, joinVoice, leaveVoice]);

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
    // PLAYLIST
    // ============================================
    const addToQueue = useCallback((mediaItem) => {
        setPlaylist(prev => [...prev, mediaItem]);
    }, []);

    const removeFromQueue = useCallback((index) => {
        setPlaylist(prev => prev.filter((_, i) => i !== index));
    }, []);

    const voteSkip = useCallback(() => {
        console.log("Vote skip triggered");
    }, []);

    // ============================================
    // CURRENT USER
    // ============================================
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
    // ============================================
    // CONTEXT VALUE
    // ============================================
    const value = React.useMemo(() => ({
        // State
        room,
        currentUser,
        currentMedia,
        playback,
        chat,
        participants,
        voiceParticipants,
        isLocked,
        isHost,
        isRoomLoaded,
        loadingStatus,
        isConnected,
        connectionError,
        playerRef,
        playlist,
        activeReaction,

        // Room Actions
        createRoom,
        joinRoom,
        leaveRoom,

        // Chat
        sendMessage,
        addMessageReaction,
        sendReaction,

        // Playback (Host Only)
        updatePlayback,
        setMedia,
        clearMedia,

        // Host Controls
        toggleLock,
        kickParticipant,
        transferHost,
        muteParticipant,

        // Voice
        joinVoice,
        leaveVoice,
        toggleVoice,

        // Playlist
        addToQueue,
        removeFromQueue,
        voteSkip,

        // Sync
        requestSync
    }), [
        room,
        currentUser.id, currentUser.name, currentUser.avatar, currentUser.isHost, currentUser.oderId, // Deconstruct currentUser to be safe
        currentMedia,
        playback,
        chat,
        participants,
        voiceParticipants,
        isLocked,
        isHost,
        isRoomLoaded,
        loadingStatus,
        isConnected,
        connectionError,
        // playerRef is a ref, stable
        playlist,
        activeReaction,
        createRoom, joinRoom, leaveRoom,
        sendMessage, addMessageReaction, sendReaction,
        updatePlayback, setMedia, clearMedia,
        toggleLock, kickParticipant, transferHost, muteParticipant,
        joinVoice, leaveVoice, toggleVoice,
        addToQueue, removeFromQueue, voteSkip,
        requestSync
    ]);

    return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};
