import React, { useState } from 'react';
import { Mic, MicOff, Headphones, Settings, LogOut, VolumeX, Check, AlertCircle } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { useVoice } from '../context/VoiceContext';
import GlowButton from './GlowButton';
import './VoicePanel.css';

const VoicePanel = () => {
    const { room, currentUser } = useRoom();
    const {
        voiceParticipants,
        toggleVoice,
        toggleMute,
        toggleDeafen,
        toggleNoise,
        toggleEcho,
        isMuted,
        isDeafened,
        isNoiseOn,
        isEchoOn,
        userVolumes,
        setUserVolume,
        localVolume
    } = useVoice();

    const [showSettings, setShowSettings] = useState(false);
    const isVoiceActive = voiceParticipants.some(p => p.oderId === currentUser?.oderId);

    if (!isVoiceActive && voiceParticipants.length === 0) {
        return (
            <div className="voice-panel empty">
                <div className="voice-header">
                    <div className="voice-status">
                        <span>VOICE CHANNEL</span>
                        <span className="live-dot inactive"></span>
                    </div>
                </div>
                <div className="voice-empty-state">
                    <p>No one is talking yet.</p>
                </div>
                <GlowButton onClick={toggleVoice} size="xs" fullWidth>
                    Join Voice
                </GlowButton>
            </div>
        );
    }

    return (
        <div className="voice-panel active">
            <div className="voice-header">
                <div className="voice-status">
                    <span>VOICE ACTIVE</span>
                    <span className="live-dot pulse"></span>
                </div>
                <div className="voice-count">
                    {voiceParticipants.length} online
                </div>
            </div>



            <div className="voice-participants-grid">
                {voiceParticipants.map(member => (
                    <div
                        key={member.oderId}
                        className={`voice-member-card ${member.isSpeaking ? 'speaking' : ''} ${member.isDeafened ? 'deafened' : ''} ${member.oderId === currentUser?.oderId ? 'local' : ''}`}
                    >
                        <div className="avatar-wrapper">
                            <img
                                src={member.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.oderId}`}
                                alt={member.name}
                                className="member-avatar"
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.oderId}`;
                                }}
                            />
                            {member.isSpeaking && <div className="speaking-ring"></div>}
                            <div className="member-status-badges">
                                {member.isMuted && <div className="status-badge muted" title="Muted"><MicOff size={10} /></div>}
                                {member.isDeafened && <div className="status-badge deafened" title="Deafened"><VolumeX size={10} /></div>}
                            </div>
                        </div>
                        <span className="member-name">{member.oderId === currentUser?.oderId ? 'You' : member.name}</span>

                        {/* Phase 8: Local Mic Meter */}
                        {member.oderId === currentUser?.oderId && isVoiceActive && !isMuted && (
                            <div className="volume-meter-container">
                                <div
                                    className="volume-meter-bar"
                                    style={{ width: `${localVolume}%` }}
                                ></div>
                            </div>
                        )}

                        {/* Individual Volume Control on Hover */}
                        {member.oderId !== currentUser?.oderId && (
                            <div className="member-controls-overlay">
                                <span className="vol-val">{Math.round((userVolumes[member.oderId] ?? 1) * 100)}%</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={userVolumes[member.oderId] ?? 1}
                                    onChange={(e) => setUserVolume(member.oderId, parseFloat(e.target.value))}
                                    className="member-volume-slider"
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {isVoiceActive ? (
                <div className="voice-controls-row">
                    <div className="main-controls">
                        <button
                            className={`control-btn mic ${isMuted ? 'off' : 'on'}`}
                            onClick={toggleMute}
                            title={isMuted ? "Unmute Mic" : "Mute Mic"}
                        >
                            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        <button
                            className={`control-btn speaker ${isDeafened ? 'off' : 'on'}`}
                            onClick={toggleDeafen}
                            title={isDeafened ? "Undeafen" : "Deafen"}
                        >
                            {isDeafened ? <VolumeX size={18} /> : <Headphones size={18} />}
                        </button>

                        <button
                            className={`control-btn settings ${showSettings ? 'active' : ''}`}
                            onClick={() => setShowSettings(!showSettings)}
                            title="Voice Settings"
                        >
                            <Settings size={18} />
                        </button>
                    </div>

                    <button className="leave-voice-btn" onClick={toggleVoice} title="Leave Voice">
                        <LogOut size={16} /> <span>Leave</span>
                    </button>
                </div>
            ) : (
                <div className="join-footer">
                    <GlowButton onClick={toggleVoice} size="xs" fullWidth>
                        Join Voice
                    </GlowButton>
                </div>
            )}

            {showSettings && (
                <div className="voice-settings-dropdown">
                    <div className="settings-item" onClick={toggleNoise}>
                        <span>Noise Suppression</span>
                        <div className={`toggle-switch ${isNoiseOn ? 'active' : ''}`}></div>
                    </div>
                    <div className="settings-item" onClick={toggleEcho}>
                        <span>Echo Cancellation</span>
                        <div className={`toggle-switch ${isEchoOn ? 'active' : ''}`}></div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default VoicePanel;
