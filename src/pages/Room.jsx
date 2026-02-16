import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactPlayer from 'react-player';
import { Play, Pause, Volume2, Mic, Phone, Copy, Check, Send, MessageCircle, X, Lock, Unlock, Trash2, MicOff, SkipBack, SkipForward, LogOut, Users, Crown, ArrowLeftRight, ArrowLeft, User, Settings, Smile, WifiOff } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { motion, AnimatePresence } from 'framer-motion';
import GlowButton from '../components/GlowButton';
import classNames from 'classnames';
import './Room.css';
import './RoomMembers.css';
import { useToast } from '../context/ToastContext';

import MediaSelector from '../components/MediaSelector';
import ChatPanel from '../components/ChatPanel';
import MediaPlayer from '../components/MediaPlayer';
import FullscreenChatOverlay from '../components/FullscreenChatOverlay';
import VoiceManager from '../components/VoiceManager';
import VoicePanel from '../components/VoicePanel';
import VoiceBottomSheet from '../components/voice/VoiceBottomSheet';
import LoadingScreen from '../components/LoadingScreen';
import { useVoice } from '../context/VoiceContext';

// ========================================================
// MEMOIZED MEDIA SECTION
// ========================================================
const MemoizedMediaSection = React.memo(({ currentMedia, isHost, chat, participants, currentUser, sendMessage, addMessageReaction, setMedia, clearMedia, roomType }) => {

    // Stable key for MediaPlayer to avoid unnecessary unmounting
    // Use ID if available, otherwise URL. Fallback to 'media-player-root' to prevent random re-mounts.
    // Only date/random if absolutely no identifier exists (rare).
    const mediaKey = currentMedia?.id || currentMedia?.url || 'media-player-root';

    return (
        <div className={classNames("media-section", { "selection-mode": !currentMedia })}>
            <div className="video-container">
                {!currentMedia ? (
                    isHost ? (
                        <MediaSelector onSelect={setMedia} roomType={roomType} />
                    ) : (
                        <div className="empty-state-message">
                            <h2>Waiting for Host...</h2>
                            <p>The host hasn't selected any media yet.</p>
                        </div>
                    )
                ) : (
                    <MediaPlayer
                        key={mediaKey}
                        media={currentMedia}
                        isHost={isHost}
                        onClearMedia={clearMedia}
                    >
                        <FullscreenChatOverlay
                            chat={chat}
                            currentUser={currentUser}
                            participants={participants}
                            onSendMessage={sendMessage}
                            onSendReaction={addMessageReaction}
                        />
                    </MediaPlayer>
                )}
            </div>
        </div>
    );
});

const Room = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    // ... existing hooks
    const {
        room, currentUser, currentMedia, setMedia, clearMedia, playback, chat, participants, activeReaction,
        sendMessage, updatePlayback, sendReaction,
        isLocked, isHost, toggleLock, kickParticipant, muteParticipant, addMessageReaction,
        playlist, addToQueue, voteSkip, removeFromQueue, transferHost, editMessage, deleteMessage,
        isRoomLoaded, loadingStatus, joinRoom, leaveRoom, isConnected
    } = useRoom();

    const {
        voiceParticipants, toggleVoice, isMuted, toggleMute,
        isVoiceOpenMobile, setIsVoiceOpenMobile
    } = useVoice();

    const playerRef = useRef(null);
    // State for UI
    const [sidebarTab, setSidebarTab] = useState(() => {
        const stored = sessionStorage.getItem('syncroom_sidebar_tab');
        return (stored && stored !== 'queue') ? stored : 'chat';
    });
    const [isSidePanelVisible, setIsSidePanelVisible] = useState(true); // Desktop sidebar toggle
    const [showMobileChat, setShowMobileChat] = useState(false);
    const [showMobileSettings, setShowMobileSettings] = useState(false);
    const [copied, setCopied] = useState(false);
    const [mobileMessage, setMobileMessage] = useState('');
    const { success, info, error: showError } = useToast();

    useEffect(() => {
        sessionStorage.setItem('syncroom_sidebar_tab', sidebarTab);
    }, [sidebarTab]);

    // Handle URL-based Room Joining (Deep Linking)
    useEffect(() => {
        if (!roomId) return;

        // Wait for socket to be connected before attempting join
        if (!isConnected) return;

        // If context has fully loaded a room
        if (isRoomLoaded && room) {
            // Check for mismatch (e.g., auto-rejoin joined 'A', but URL is 'B')
            if (room.code !== roomId) {
                console.log(`[Room] Mismatch detected. Joined ${room.code}, but URL is ${roomId}. Switching...`);
                joinRoom(roomId).catch(err => {
                    console.error("Failed to switch room:", err);
                    showError('Failed to switch rooms');
                    navigate('/');
                });
            }
        }
        // If room is NOT loaded yet
        else if (!isRoomLoaded && loadingStatus === 'Ready') {
            // Check if sessionStorage matches - if yes, auto-rejoin already handled it
            // If different, we need to trigger join
            const stored = sessionStorage.getItem('syncroom_last_room');
            if (stored !== roomId) {
                console.log(`[Room] Initial Join via URL: ${roomId}`);
                joinRoom(roomId).catch(err => {
                    console.error("Join failed:", err);
                    showError(err.message || 'Failed to join room');
                });
            }
        }
    }, [roomId, room, isRoomLoaded, loadingStatus, isConnected, joinRoom, navigate, showError]);

    const handleMobileSendMessage = () => {
        if (mobileMessage.trim()) {
            sendMessage(mobileMessage);
            setMobileMessage('');
        }
    };


    // ... (existing handlers remain the same)
    const handleCopyCode = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        navigator.clipboard.writeText(room?.code || '');
        setCopied(true);
        success('Room code copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
    };


    const handleExitRoom = () => {
        leaveRoom(); // Notify server that user is leaving
        navigate('/');
    };

    const toggleSidePanel = () => {
        setIsSidePanelVisible(!isSidePanelVisible);
    };

    // Add loading timeout to prevent infinite loading
    useEffect(() => {
        if (!isRoomLoaded) {
            const timeout = setTimeout(() => {
                console.warn('[Room] Loading timeout - redirecting to home');
                sessionStorage.removeItem('syncroom_last_room');
                showError('Failed to load room. Redirecting to home...');
                navigate('/');
            }, 10000); // 10 second timeout

            return () => clearTimeout(timeout);
        }
    }, [isRoomLoaded, navigate, showError]);

    // Redirect if room loaded but no room exists (MUST be before early returns!)
    useEffect(() => {
        if (isRoomLoaded && !room) {
            const timeout = setTimeout(() => {
                console.warn('[Room] No room found - redirecting to home');
                navigate('/');
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [isRoomLoaded, room, navigate]);


    if (!isRoomLoaded) {
        // Safe access to loadingStatus from context, default to "Loading..."
        const status = loadingStatus || "Loading Room...";
        return <LoadingScreen message={status} />;
    }

    if (!room) {
        return <div className="loading-screen">Room not found. Redirecting...</div>;
    }

    const isVoiceActive = voiceParticipants.some(p => p.oderId === currentUser?.oderId);

    return (
        <div className="room-page">
            <VoiceManager />
            <VoiceBottomSheet />
            {/* MOBILE HEADER - Fixed Top */}
            <div className="mobile-header">
                <button className="mobile-back-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="mobile-room-info">
                    <h3 className="mobile-room-name">{room.name}</h3>
                    <p className="mobile-room-status">
                        <span className="online-dot"></span>
                        {participants.length} Online
                        {voiceParticipants.length > 0 && ` • ${voiceParticipants.length} Speaking`}
                    </p>
                </div>
                <div className="mobile-header-actions">
                    <button
                        className="mobile-header-btn"
                        onClick={() => setShowMobileSettings(!showMobileSettings)}
                        style={{ background: showMobileSettings ? 'rgba(255,255,255,0.2)' : '' }}
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* MOBILE SETTINGS PANEL (Slide Down) */}
            <AnimatePresence>
                {showMobileSettings && (
                    <motion.div
                        className="mobile-settings-panel"
                        initial={{ y: -100, opacity: 0 }}
                        animate={{ y: 60, opacity: 1 }}
                        exit={{ y: -100, opacity: 0 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, width: '100%',
                            background: '#1e293b', zIndex: 90, padding: '1rem',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Room Code: <strong>{room.code}</strong></span>
                                <button type="button" onClick={handleCopyCode} style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer' }}>
                                    {copied ? <Check size={18} /> : <Copy size={18} />}
                                </button>
                            </div>

                            {/* MEMBERS JOINED SECTION */}
                            <div className="mobile-settings-members">
                                <h4 style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#94a3b8' }}>Members ({participants.length})</h4>
                                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {participants.map(p => (
                                        <div key={p.oderId || p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                            <img src={p.avatar} alt={p.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, aspectRatio: '1/1' }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                                                    {p.name} {p.id === currentUser?.id && '(You)'}
                                                </div>
                                                {p.isHost && (
                                                    <span style={{ fontSize: '0.7rem', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                                        HOST
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {isHost && (
                                <button onClick={toggleLock} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center' }}>
                                    {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                                    {isLocked ? 'Unlock Room' : 'Lock Room'}
                                </button>
                            )}

                            <button onClick={handleExitRoom} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid #ef4444' }}>
                                Leave Room
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* CONTENT WRAPPER (Shared) */}
            <div className="content-scroll-area">
                {/* Main Stage (Shared) */}
                <MemoizedMediaSection
                    currentMedia={currentMedia}
                    isHost={isHost}
                    chat={chat}
                    participants={participants}
                    currentUser={currentUser}
                    sendMessage={sendMessage}
                    addMessageReaction={addMessageReaction}
                    setMedia={setMedia}
                    clearMedia={clearMedia}
                    roomType={room?.type}
                />

                {/* MOBILE CHAT SHEET (Overlay) */}
                <div className={`mobile-chat-sheet ${showMobileChat ? 'visible' : 'hidden'}`}>
                    <div className="chat-sheet-header" onClick={() => setShowMobileChat(false)}>
                        <div className="sheet-handle"></div>
                        <button className="chat-sheet-close" style={{ position: 'absolute', right: '1rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                    </div>

                    <div className="mobile-chat-messages">
                        <ChatPanel
                            chat={chat}
                            currentUser={currentUser}
                            participants={participants}
                            onSendMessage={sendMessage}
                            onSendReaction={addMessageReaction}
                            editMessage={editMessage}
                            deleteMessage={deleteMessage}
                        />
                    </div>

                    <div className="mobile-chat-input-container">
                        <button className="mobile-input-emoji" style={{ color: 'rgba(255,255,255,0.7)' }}>
                            <Smile size={24} />
                        </button>
                        <input
                            type="text"
                            className="mobile-input-field"
                            placeholder="Chat..."
                            value={mobileMessage}
                            onChange={(e) => setMobileMessage(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleMobileSendMessage()}
                        />
                        <button className="mobile-input-send" onClick={handleMobileSendMessage}>
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* MOBILE FLOATING CHAT BUTTON */}
            {!showMobileChat && (
                <button
                    className="mobile-chat-fab"
                    onClick={() => setShowMobileChat(true)}
                >
                    <MessageCircle size={24} />
                    {chat.length > 0 && <span className="chat-badge-dot"></span>}
                </button>
            )}

            {/* DESKTOP SIDEBAR */}
            <div className={classNames("room-sidebar", {
                "sidebar-hidden": !isSidePanelVisible
            })}>
                <button className="chat-toggle-arrow" onClick={toggleSidePanel} title="Toggle Sidebar">
                    {isSidePanelVisible ? <ArrowLeftRight size={20} /> : <ArrowLeft size={20} />}
                </button>

                <div className="sidebar-header">
                    <div className="room-meta">
                        <h2>{room.name}</h2>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button type="button" className={`room-code-badge ${copied ? 'copied' : ''}`} onClick={handleCopyCode}>
                                {copied ? <Check size={14} /> : <Copy size={14} />} {room.code}
                            </button>
                            <button
                                type="button"
                                className="exit-room-btn"
                                onClick={handleExitRoom}
                                title="Exit Room"
                                style={{
                                    background: 'rgba(239, 68, 68, 0.2)',
                                    color: '#ef4444',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    fontSize: '0.85rem',
                                    fontWeight: '500',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                            >
                                <LogOut size={14} /> Exit
                            </button>
                        </div>
                    </div>
                </div>

                <div className="desktop-voice-panel">
                    <VoicePanel />
                </div>

                <div className="sidebar-tabs">
                    <button className={classNames("tab-btn", { active: sidebarTab === 'chat' })} onClick={() => setSidebarTab('chat')}>Chat</button>
                    <button className={classNames("tab-btn", { active: sidebarTab === 'members' })} onClick={() => setSidebarTab('members')}>Members</button>
                </div>

                <div className="sidebar-content">
                    {/* CHAT TAB */}
                    <div style={{ display: sidebarTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
                        <ChatPanel chat={chat} currentUser={currentUser} participants={participants} onSendMessage={sendMessage} onSendReaction={addMessageReaction} editMessage={editMessage} deleteMessage={deleteMessage} />
                    </div>

                    {/* MEMBERS TAB */}
                    <div style={{ display: sidebarTab === 'members' ? 'block' : 'none', height: '100%', overflowY: 'auto' }}>
                        <div className="members-panel">
                            {participants.map(p => (
                                <div key={p.oderId} className="member-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span>{p.name}</span>
                                        {p.isHost && <Crown size={14} style={{ color: '#f59e0b' }} />}
                                    </div>
                                    {isHost && !p.isHost && (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => transferHost(p.oderId)}
                                                style={{
                                                    background: 'rgba(139, 92, 246, 0.2)',
                                                    color: '#a78bfa',
                                                    border: '1px solid #8b5cf6',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    cursor: 'pointer'
                                                }}
                                                title="Transfer Host"
                                            >
                                                Make Host
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (window.confirm(`Are you sure you want to remove ${p.name} from the room?`)) {
                                                        kickParticipant(p.oderId, p.name);
                                                    }
                                                }}
                                                style={{
                                                    background: 'rgba(239, 68, 68, 0.2)',
                                                    color: '#ef4444',
                                                    border: '1px solid #ef4444',
                                                    padding: '0.25rem',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                                title="Kick Member"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            {/* MOBILE FABS */}
            {/* MOBILE VOICE FAB */}
            {!showMobileChat && (
                <button
                    className={`mobile-voice-fab ${voiceParticipants.some(p => p.oderId === currentUser?.oderId) ? 'active' : ''}`}
                    onClick={() => setIsVoiceOpenMobile(true)}
                >
                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                    {voiceParticipants.length > 0 && <span className="speaking-count-badge">{voiceParticipants.length}</span>}
                </button>
            )}

            {/* Reconnecting Overlay */}
            {!isConnected && (
                <div className="reconnecting-overlay">
                    <WifiOff size={18} />
                    <span>Reconnecting...</span>
                </div>
            )}
        </div>
    );
};

export default Room;

