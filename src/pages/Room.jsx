import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactPlayer from 'react-player';
import { Play, Pause, Volume2, Mic, Phone, Copy, Check, Send, MessageCircle, X, Lock, Unlock, Trash2, MicOff, SkipBack, SkipForward, LogOut, Users, Crown, ArrowLeftRight } from 'lucide-react';
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

const Room = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    // ... existing hooks
    const {
        room, currentUser, currentMedia, setMedia, clearMedia, playback, chat, participants, voiceParticipants, activeReaction,
        sendMessage, updatePlayback, toggleVoice, sendReaction,
        isLocked, isHost, toggleLock, kickParticipant, muteParticipant, addMessageReaction,
        playlist, addToQueue, voteSkip, removeFromQueue, transferHost
    } = useRoom();

    const playerRef = useRef(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [sidebarTab, setSidebarTab] = useState('chat'); // 'chat' | 'queue' | 'members'
    const { success, info } = useToast();

    // Handlers
    const handleCopyCode = () => {
        navigator.clipboard.writeText(room?.code || '');
        setCopied(true);
        success('Room code copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleExitRoom = () => {
        navigate('/');
    };

    // Toggle Play
    const togglePlay = () => {
        updatePlayback({ isPlaying: !playback.isPlaying });
    };

    const handleSeek = (seconds) => {
        if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime();
            playerRef.current.seekTo(currentTime + seconds);
        }
    };

    if (!room) return <div className="loading-screen">Loading Room...</div>;

    const isVoiceActive = voiceParticipants.some(p => p.id === currentUser?.id);
    // const isHost = currentUser?.isHost; // Removed redundant check


    return (
        <div className="room-page">
            {/* Main Stage (Cinema Mode) */}
            <div className="media-section">
                <div className="video-container">
                    {!currentMedia ? (
                        /* Empty State / Media Selector */
                        isHost ? (
                            <MediaSelector onSelect={setMedia} roomType={room.type} />
                        ) : (
                            <div className="empty-state-message">
                                <h2>Waiting for Host to select media...</h2>
                            </div>
                        )
                    ) : (
                        /* Active Player */
                        <MediaPlayer
                            key={currentMedia.url}
                            media={currentMedia}
                            isHost={isHost}
                            onClearMedia={clearMedia}
                        />
                    )}

                    {/* Controls Overlay - Disabled for native player
                    <div className="controls-overlay">
                        <div className="controls-bar">
                            <button className="control-btn" onClick={() => handleSeek(-10)} title="-10s">
                                <SkipBack size={20} fill="white" />
                            </button>
                            <button className="control-btn" onClick={togglePlay}>
                                {playback.isPlaying ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" />}
                            </button>
                            <button className="control-btn" onClick={() => handleSeek(10)} title="+10s">
                                <SkipForward size={20} fill="white" />
                            </button>

                            <div className="progress-bar-container">
                                <div className="progress-bar" style={{ width: '30%' }}></div>
                            </div>

                            <div className="time-display">04:20 / 12:45</div>

                            <div className="volume-controls">
                                <Volume2 size={24} />
                            </div>

                            <button className="control-btn exit-btn" onClick={handleExitRoom} title="Exit Room">
                                <LogOut size={20} />
                            </button>

                            <button
                                className="control-btn mobile-only-btn"
                                onClick={() => setMobileMenuOpen(true)}
                                style={{ marginLeft: '1rem' }}
                            >
                                <MessageCircle size={24} />
                            </button>
                        </div>
                    </div>
                    */}

                    {/* Reactions Layer */}
                    <AnimatePresence>
                        {activeReaction && (
                            <motion.div
                                className="reaction-overlay"
                                initial={{ opacity: 0, y: 0, scale: 0.5 }}
                                animate={{ opacity: 1, y: -100, scale: 1.5 }}
                                exit={{ opacity: 0, y: -200 }}
                            >
                                <span className="floating-emoji">{activeReaction.emoji}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Glass Sidebar */}
            <div className={classNames("room-sidebar", { "show-mobile": mobileMenuOpen })}>
                {/* Header Area */}
                <div className="sidebar-header">
                    <div className="room-meta">
                        <h2>{room.name}</h2>
                        <button className="room-code-badge" onClick={handleCopyCode}>
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {roomId}
                        </button>
                        {isHost && (
                            <button
                                className={classNames("room-action-btn", { "locked": isLocked })}
                                onClick={toggleLock}
                                title={isLocked ? "Unlock Room" : "Lock Room"}
                            >
                                {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                            </button>
                        )}
                    </div>
                    <button className="close-mobile-btn" onClick={() => setMobileMenuOpen(false)}>
                        <X size={24} />
                    </button>
                </div>

                {/* Voice Panel */}
                <div className="voice-panel">
                    <div className="voice-status">
                        <span>VOICE CHANNEL</span>
                        <span className="live-dot">● Live</span>
                    </div>

                    <div className="voice-avatars">
                        {voiceParticipants.map(user => (
                            <div key={user.id} className={classNames("voice-user", { "speaking": user.isSpeaking })}>
                                <div className="voice-user-inner">
                                    <img src={user.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.name} className="voice-user-avatar" alt={user.name} />
                                    <span className="voice-user-name">{user.name}</span>
                                </div>
                                {isHost && user.id !== currentUser.id && (
                                    <div className="voice-user-controls">
                                        <button className="control-icon-btn mute" onClick={() => muteParticipant(user.id, user.name)} title="Mute User">
                                            <MicOff size={14} />
                                        </button>
                                        <button className="control-icon-btn kick" onClick={() => kickParticipant(user.id, user.name)} title="Kick User">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {voiceParticipants.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No one is talking yet...</span>}
                    </div>

                    <GlowButton
                        variant={isVoiceActive ? "danger" : "success"}
                        size="sm"
                        fullWidth
                        onClick={toggleVoice}
                    >
                        {isVoiceActive ? <><Phone size={16} style={{ transform: 'rotate(135deg)' }} className="mr-2" /> Leave Voice</> : <><Mic size={16} className="mr-2" /> Join Voice</>}
                    </GlowButton>
                </div>

                {/* Sidebar Tabs */}
                <div className="sidebar-tabs">
                    <button
                        className={classNames("tab-btn", { active: sidebarTab === 'chat' })}
                        onClick={() => setSidebarTab('chat')}
                    >
                        Chat
                    </button>
                    <button
                        className={classNames("tab-btn", { active: sidebarTab === 'members' })}
                        onClick={() => setSidebarTab('members')}
                    >
                        Members ({participants.length})
                    </button>
                    <button
                        className={classNames("tab-btn", { active: sidebarTab === 'queue' })}
                        onClick={() => setSidebarTab('queue')}
                    >
                        Queue
                    </button>
                </div>

                {/* Content Area (Chat, Members, or Playlist) */}
                <div className="sidebar-content">
                    {sidebarTab === 'chat' ? (
                        <ChatPanel
                            chat={chat}
                            currentUser={currentUser}
                            participants={participants}
                            onSendMessage={sendMessage}
                            onSendReaction={addMessageReaction}
                        />
                    ) : sidebarTab === 'members' ? (
                        <div className="members-panel">
                            {participants.map(p => (
                                <div key={p.oderId} className="member-item">
                                    <img src={p.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + p.name} className="member-avatar" alt={p.name} />
                                    <div className="member-info">
                                        <span className={classNames("member-name", { "is-host": p.isHost })}>
                                            {p.name} {p.oderId === currentUser.oderId && "(You)"}
                                        </span>
                                        {p.isHost && <span className="host-badge"><Crown size={12} fill="#fbbf24" stroke="none" /> HOST</span>}
                                    </div>

                                    {/* Host Actions */}
                                    {isHost && !p.isHost && (
                                        <div className="member-actions">
                                            <button
                                                className="action-icon-btn promote"
                                                title="Make Host"
                                                onClick={() => {
                                                    if (window.confirm(`Make ${p.name} the new host?`)) {
                                                        transferHost(p.oderId);
                                                        success(`Transferred host to ${p.name}`);
                                                    }
                                                }}
                                            >
                                                <Crown size={14} />
                                            </button>
                                            <button
                                                className="action-icon-btn kick"
                                                title="Kick User"
                                                onClick={() => {
                                                    if (window.confirm(`Kick ${p.name}?`)) {
                                                        kickParticipant(p.oderId, p.name);
                                                        info(`Kicked ${p.name}`);
                                                    }
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Playlist
                            playlist={playlist}
                            currentMedia={currentMedia}
                            onPlay={setMedia}
                            onRemove={removeFromQueue}
                            onVoteSkip={voteSkip}
                            isHost={isHost}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default Room;
