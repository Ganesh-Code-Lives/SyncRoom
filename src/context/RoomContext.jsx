import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { socket } from '../lib/socket';
import { sfuVoiceClient } from '../lib/sfuVoiceClient';

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
    const [isLocked, setIsLocked] = useState(false);
    const [isHost, setIsHost] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [activeReaction, setActiveReaction] = useState(null);
    const [userVolumes, setUserVolumes] = useState({}); // userId -> volume (0-1)
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

            // AUTO-REJOIN: Priority 1: Current Room State, Priority 2: Session Storage
            const codeToJoin = room?.code || sessionStorage.getItem('syncroom_last_room');

            if (codeToJoin) {
                console.log('[Socket] Attempting REJOIN to:', codeToJoin);

                // If we are already loaded, just show valid syncing state, don't unmount
                // If fresh load, show specific rejoining message
                setLoadingStatus(isRoomLoaded ? 'Syncing connection...' : 'Rejoining room...');

                const { oderId, userName, userAvatar } = getUserInfo();

                // FAILSAFE: 10s limit for join response (increased for bad networks)
                let timeoutFired = false;
                const joinTimeout = setTimeout(() => {
                    timeoutFired = true;
                    if (!isRoomLoaded) { // Only error out if we were stuck on loading screen
                        console.warn('[Socket] Join timeout - redirecting');
                        sessionStorage.removeItem('syncroom_last_room');
                        setIsRoomLoaded(true);
                        setRoom(null);
                        showError('Connection timed out. Please try again.');
                        navigate('/');
                    } else {
                        // If we were already loaded, just warn but keep UI (might have recovered quietly)
                        console.warn('[Socket] Rejoin slow response, but UI is active.');
                    }
                }, 10000);

                socket.emit('join_room', {
                    roomCode: codeToJoin,
                    userId: oderId,
                    userName,
                    userAvatar
                }, (response) => {
                    if (timeoutFired) return;
                    clearTimeout(joinTimeout);

                    if (response.success) {
                        console.log('[Socket] Rejoin successful - Snapshot Received');
                        setLoadingStatus('Ready');

                        // SNAPSHOT AUTHORITY: Always overwrite local state with server state
                        const roomData = response.room;
                        setRoom({
                            code: roomData.roomId,
                            name: roomData.roomName,
                            type: roomData.roomType,
                            hostId: roomData.hostId,
                            voiceUsers: roomData.voiceUsers || []
                        });
                        setIsHost(roomData.hostId === oderId);
                        setParticipants(roomData.users.map(u => ({
                            ...u,
                            isHost: u.oderId === roomData.hostId
                        })));
                        setChat(roomData.chat || []);
                        setCurrentMedia(roomData.media);

                        // Only update playback if playing to avoid jitter on paused states
                        // Or trust server time completely (safest for sync)
                        setPlayback({
                            isPlaying: roomData.isPlaying,
                            currentTime: roomData.currentTime,
                            duration: 0
                        });

                        setIsLocked(roomData.isLocked);
                        setIsRoomLoaded(true);

                        // Update storage just in case we recovered from in-memory only
                        sessionStorage.setItem('syncroom_last_room', roomData.roomId);
                    } else {
                        console.error('[Socket] Failed to rejoin:', response.error);
                        // Only clear if strictly necessary
                        if (response.error.includes('not exist') || response.error.includes('locked')) {
                            sessionStorage.removeItem('syncroom_last_room');
                            setRoom(null);
                            setIsRoomLoaded(true);
                            navigate('/');
                            showError(response.error);
                        } else {
                            // Temporary server error? Keep retrying or let user exit
                            showError('Rejoin failed: ' + response.error);
                        }
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
            // Do NOT clear room state here. Wait for reconnection or explicit leave.
        };

        const handleServerHeartbeat = (data) => {
            // Optional: Update last-heard timestamp if implementing strict UI timeout
            // For now, just confirming receipt is enough to keep socket logic happy
            // console.log('[Socket] Heartbeat:', data);
        };

        const handleConnectError = (error) => {
            console.error('[Socket] Connection error:', error);
            // Don't show toast on every retry, it spams
            if (activeReaction !== 'connect_error') { // Hacky debounce using state if needed, or just log
                // setConnectionError('Connection unstable...'); // We use isConnected for UI
            }
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

        const handleMessageUpdated = (data) => {
            const { messageId, newContent, isEdited } = data;
            setChat(prev => prev.map(msg =>
                msg.id === messageId ? { ...msg, content: newContent, isEdited } : msg
            ));
        };

        const handleMessageDeleted = (data) => {
            const { messageId } = data;
            setChat(prev => prev.filter(msg => msg.id !== messageId));
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
        socket.on('host_update', handleHostUpdate);
        socket.on('reaction_received', handleReactionReceived);
        socket.on('reaction_received', handleReactionReceived);
        socket.on('message_reaction_update', handleMessageReactionUpdate);
        socket.on('message_updated', handleMessageUpdated);
        socket.on('message_deleted', handleMessageDeleted);
        socket.on('server_heartbeat', handleServerHeartbeat);

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
            socket.off('host_update', handleHostUpdate);
            socket.off('reaction_received', handleReactionReceived);
            socket.off('message_reaction_update', handleMessageReactionUpdate);
            socket.off('message_updated', handleMessageUpdated);
            socket.off('message_deleted', handleMessageDeleted);
            socket.off('server_heartbeat', handleServerHeartbeat);
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
                    // STRICT AUTHORITY: Only set state after success
                    setRoom({
                        code: response.roomCode,
                        name: roomData.roomName,
                        type: roomData.roomType,
                        hostId: roomData.hostId,
                        voiceUsers: roomData.voiceUsers || []
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
                        hostId: roomData.hostId,
                        voiceUsers: roomData.voiceUsers || []
                    });
                    setIsHost(roomData.hostId === oderId);

                    // 2. Participants & Voice
                    setParticipants(roomData.users.map(u => ({
                        ...u,
                        isHost: u.oderId === roomData.hostId
                    })));

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
                    // STRICT REDIRECT handling
                    if (response.redirect) {
                        console.warn('[Join] Room not found. Redirecting...');
                        sessionStorage.removeItem('syncroom_last_room');
                        setRoom(null);
                        window.location.href = '/'; // Hard redirect to clear state
                        // navigate('/') can be insufficient if state is stuck
                    }
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
        sfuVoiceClient.close(); // Clean up voice on exit
        navigate('/');
    }, [navigate]);

    // ============================================
    // CHAT
    // ============================================
    const sendMessage = useCallback((text, replyTo = null) => {
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
            replyTo,
            isEdited: false,
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
                content: text,
                replyTo
            }
        });

        // Replace optimistic message with server message when received
        // (handled in handleNewMessage by matching content + senderId)
    }, [room, getUserInfo, user]);

    const editMessage = useCallback((messageId, newContent) => {
        if (!room) return;
        const { oderId } = getUserInfo();

        // Optimistic update
        setChat(prev => prev.map(msg =>
            msg.id === messageId ? { ...msg, content: newContent, isEdited: true } : msg
        ));

        socket.emit('edit_message', {
            roomCode: room.code,
            messageId,
            newContent,
            userId: oderId
        });
    }, [room, getUserInfo]);

    const deleteMessage = useCallback((messageId) => {
        if (!room) return;
        const { oderId } = getUserInfo();

        // Optimistic update
        setChat(prev => prev.filter(msg => msg.id !== messageId));

        socket.emit('delete_message', {
            roomCode: room.code,
            messageId,
            userId: oderId
        });
    }, [room, getUserInfo]);

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

    const value = useMemo(() => ({
        // State
        room,
        currentUser,
        currentMedia,
        playback,
        chat,
        participants,
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
        // Chat
        sendMessage,
        editMessage,
        deleteMessage,
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

        // Playlist
        addToQueue,
        removeFromQueue,
        voteSkip,

        // Sync
        requestSync
    }), [
        room,
        currentUser.id, currentUser.name, currentUser.avatar, currentUser.isHost, currentUser.oderId,
        currentMedia,
        playback,
        chat,
        participants,
        isLocked,
        isHost,
        isRoomLoaded,
        loadingStatus,
        isConnected,
        connectionError,
        playlist,
        activeReaction,
        createRoom, joinRoom, leaveRoom,
        createRoom, joinRoom, leaveRoom,
        sendMessage, addMessageReaction, sendReaction, editMessage, deleteMessage,
        updatePlayback, setMedia, clearMedia,
        toggleLock, kickParticipant, transferHost, muteParticipant,
        addToQueue, removeFromQueue, voteSkip,
        requestSync
    ]);

    return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};
