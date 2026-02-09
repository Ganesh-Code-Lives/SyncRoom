import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactPlayer from 'react-player';
import { Play, Pause, Volume2, Mic, Phone, Copy, Check, Send, MessageCircle, X, Lock, Unlock, Trash2, MicOff, SkipBack, SkipForward, LogOut, Users, Crown, ArrowLeftRight, ArrowLeft, User, Settings, Smile } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { motion, AnimatePresence } from 'framer-motion';
import GlowButton from '../components/GlowButton';
import classNames from 'classnames';
import './Room.css';
import './RoomMembers.css';
import { useToast } from '../context/ToastContext';

import MediaSelector from '../components/MediaSelector';
import ChatPanel from '../components/ChatPanel';
import Playlist from '../components/Playlist';
import MediaPlayer from '../components/MediaPlayer';
import FullscreenChatOverlay from '../components/FullscreenChatOverlay';

const Room = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    // ... existing hooks
    const {
        room, currentUser, currentMedia, setMedia, clearMedia, playback, chat, participants, voiceParticipants, activeReaction,
        sendMessage, updatePlayback, toggleVoice, sendReaction,
        isLocked, isHost, toggleLock, kickParticipant, muteParticipant, addMessageReaction,
        playlist, addToQueue, voteSkip, removeFromQueue, transferHost,
        isRoomLoaded, loadingStatus, joinRoom // <--- Destructure joinRoom for URL handling!
    } = useRoom();

    const playerRef = useRef(null);
    // State for UI
    const [sidebarTab, setSidebarTab] = useState(() => sessionStorage.getItem('syncroom_sidebar_tab') || 'chat');
    const [isSidePanelVisible, setIsSidePanelVisible] = useState(true); // Desktop sidebar toggle
    const [showMobileChat, setShowMobileChat] = useState(false);
    const [showMobileSettings, setShowMobileSettings] = useState(false);
    const [copied, setCopied] = useState(false);
    const [mobileMessage, setMobileMessage] = useState('');
    const { success, info } = useToast();

    useEffect(() => {
        sessionStorage.setItem('syncroom_sidebar_tab', sidebarTab);
    }, [sidebarTab]);

    // Handle URL-based Room Joining (Deep Linking)
    useEffect(() => {
        if (!roomId) return;

        // If context has fully loaded a room
        if (isRoomLoaded && room) {
            // Check for mismatch (e.g., auto-rejoin joined 'A', but URL is 'B')
            if (room.code !== roomId) {
                console.log(`[Room] Mismatch detected. Joined ${room.code}, but URL is ${roomId}. Switching...`);
                // leaveRoom(); // Optional: clean up old room first? Context usually handles switch.
                joinRoom(roomId).catch(err => {
                    console.error("Failed to switch room:", err);
                    // navigate('/'); // Optional: redirect on fail
                });
            }
        }
        // If room is NOT loaded yet, and we are not already trying to re-join the *correct* room
        else if (!isRoomLoaded && loadingStatus === 'Initializing...') {
            // Wait a tick for socket to init, or just trigger it.
            // But wait, context auto-rejoin might race.
            // If sessionStorage matches roomId, auto-rejoin handles it.
            // If sessionStorage is different or empty, we must trigger join.

            const stored = sessionStorage.getItem('syncroom_last_room');
            if (stored !== roomId) {
                console.log(`[Room] Initial Join via URL: ${roomId}`);
                joinRoom(roomId).catch(err => console.error("Join failed:", err));
            }
        }
    }, [roomId, room, isRoomLoaded, loadingStatus, joinRoom]);

    const handleMobileSendMessage = () => {
        if (mobileMessage.trim()) {
            sendMessage(mobileMessage);
            setMobileMessage('');
        }
    };

    // ... (existing handlers remain the same)
    const handleCopyCode = () => {
        navigator.clipboard.writeText(room?.code || '');
        setCopied(true);
        success('Room code copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleExitRoom = () => {
        navigate('/');
    };

    const toggleSidePanel = () => {
        setIsSidePanelVisible(!isSidePanelVisible);
    };

    if (!isRoomLoaded) {
        // Safe access to loadingStatus from context, default to "Loading..."
        const status = loadingStatus || "Loading Room...";
        return <div className="loading-screen">{status}</div>;
    }

    if (!room) {
        return <div className="loading-screen">Joining Room...</div>;
    }

    const isVoiceActive = voiceParticipants.some(p => p.id === currentUser?.id);

    return (
        <div className="room-page">
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
                                <button onClick={handleCopyCode} style={{ background: 'none', border: 'none', color: '#8b5cf6' }}>
                                    {copied ? <Check size={18} /> : <Copy size={18} />}
                                </button>
                            </div>

                            {/* MEMBERS JOINED SECTION */}
                            <div className="mobile-settings-members">
                                <h4 style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#94a3b8' }}>Members ({participants.length})</h4>
                                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {participants.map(p => (
                                        <div key={p.oderId || p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                            <img src={p.avatar} alt={p.name} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
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
                <div className="media-section">
                    <div className="video-container">
                        {!currentMedia ? (
                            isHost ? (
                                <MediaSelector onSelect={setMedia} roomType={room.type} />
                            ) : (
                                <div className="empty-state-message"><h2>Waiting for Host...</h2></div>
                            )
                        ) : (
                            <MediaPlayer
                                key={currentMedia.url}
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
                        <button className="room-code-badge" onClick={handleCopyCode}>
                            {copied ? <Check size={14} /> : <Copy size={14} />} {room.code}
                        </button>
                    </div>
                </div>

                <div className="voice-panel">
                    {/* Simplified Voice Panel for Desktop (Same as before) */}
                    <div className="voice-status"><span>VOICE ACTIVE</span> <span className="live-dot">●</span></div>
                    <div className="voice-avatars">
                        {voiceParticipants.map(u => (
                            <div key={u.id} className="voice-user">
                                <img src={u.avatar} className="voice-user-avatar" alt={u.name} />
                            </div>
                        ))}
                        {voiceParticipants.length === 0 && <span className="text-muted">Empty</span>}
                    </div>
                    <GlowButton onClick={toggleVoice} size="sm" fullWidth>
                        {isVoiceActive ? "Leave Voice" : "Join Voice"}
                    </GlowButton>
                </div>

                <div className="sidebar-tabs">
                    <button className={classNames("tab-btn", { active: sidebarTab === 'chat' })} onClick={() => setSidebarTab('chat')}>Chat</button>
                    <button className={classNames("tab-btn", { active: sidebarTab === 'members' })} onClick={() => setSidebarTab('members')}>Members</button>
                    <button className={classNames("tab-btn", { active: sidebarTab === 'queue' })} onClick={() => setSidebarTab('queue')}>Queue</button>
                </div>

                <div className="sidebar-content">
                    {sidebarTab === 'chat' && <ChatPanel chat={chat} currentUser={currentUser} participants={participants} onSendMessage={sendMessage} onSendReaction={addMessageReaction} />}
                    {sidebarTab === 'members' && (
                        <div className="members-panel">
                            {participants.map(p => (
                                <div key={p.oderId} className="member-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span>{p.name}</span>
                                        {p.isHost && <Crown size={14} style={{ color: '#f59e0b' }} />}
                                    </div>
                                    {isHost && !p.isHost && (
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
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {sidebarTab === 'queue' && <Playlist playlist={playlist} currentMedia={currentMedia} onPlay={setMedia} onRemove={removeFromQueue} onVoteSkip={voteSkip} isHost={isHost} />}
                </div>
            </div>

            {/* MOBILE FABS */}
            <div className="mobile-fabs" style={{ display: showMobileChat ? 'none' : 'flex' }}>

            </div>
        </div>
    );
};

export default Room;
