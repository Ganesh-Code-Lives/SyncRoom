import React, { useState, useRef } from 'react';
import { Video, Music, Upload, Youtube, Link, Disc, Play, AlertCircle, Monitor } from 'lucide-react';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import Input from './Input';
import classNames from 'classnames';
import { classifyUrl } from '../lib/urlClassifier';
import './MediaSelector.css';

const MediaSelector = ({ onSelect, roomType = 'video' }) => {
    const [activeTab, setActiveTab] = useState(roomType);
    const [sourceType, setSourceType] = useState(roomType === 'video' ? 'youtube' : 'spotify');
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    const [preview, setPreview] = useState(null);
    const [showSharedViewModal, setShowSharedViewModal] = useState(false);
    const fileInputRef = useRef(null);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSourceType(tab === 'video' ? 'youtube' : 'spotify');
        setUrl('');
        setPreview(null);
        setError('');
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const objectUrl = URL.createObjectURL(file);
        setPreview({
            type: activeTab,
            source: 'file',
            url: objectUrl,
            title: file.name,
            metadata: {
                size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
                quality: 'Original Quality'
            }
        });
    };

    const handleUrlBlur = () => {
        if (!url.trim()) return;
        setError('');

        if (activeTab === 'video') {
            if (sourceType === 'youtube') {
                if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    setPreview({
                        type: 'video',
                        source: 'youtube',
                        url: url,
                        title: 'YouTube Video',
                        metadata: { quality: 'HD', duration: '--:--' }
                    });
                } else {
                    setError('Invalid YouTube URL');
                    setPreview(null);
                }
            } else if (sourceType === 'url') {
                const classified = classifyUrl(url);
                const domain = (() => {
                    try {
                        return new URL(url).hostname.replace('www.', '');
                    } catch {
                        return 'Website';
                    }
                })();
                setPreview({
                    type: 'video',
                    source: classified.source,
                    url: url,
                    title: classified.type === 'shared_view' ? `${domain} (Shared View)` : `Direct Video`,
                    metadata: classified.metadata || { quality: 'Unknown', duration: '--:--' },
                    label: classified.label
                });
            }
        } else {
            if (sourceType === 'spotify') {
                if (url.includes('spotify.com')) {
                    setPreview({
                        type: 'audio',
                        source: 'spotify',
                        url: url,
                        title: 'Spotify Track (Mock)',
                        artist: 'Unknown Artist',
                        metadata: { quality: 'Lossless (Mock)' }
                    });
                } else {
                    setError('Invalid Spotify URL');
                    setPreview(null);
                }
            } else if (sourceType === 'url') {
                setPreview({
                    type: 'audio',
                    source: 'url',
                    url: url,
                    title: 'Direct Audio Stream',
                    metadata: { quality: 'High Bitrate' }
                });
            }
        }
    };

    const handleConfirm = () => {
        if (!preview) return;
        if (preview.source === 'shared_view') {
            setShowSharedViewModal(true);
        } else {
            onSelect(preview);
        }
    };

    const handleSharedViewStart = () => {
        setShowSharedViewModal(false);
        onSelect(preview);
    };

    return (
        <div className="media-selector-container">
            <GlassCard className="media-selector-card">
                <div className="selector-header">
                    <h2>Select Media Source</h2>
                    <p>Choose what you want to watch or listen to</p>
                </div>

                {/* Tabs */}
                <div className="type-tabs">
                    {roomType === 'video' && (
                        <button
                            className={classNames('type-tab', { active: activeTab === 'video' })}
                            onClick={() => handleTabChange('video')}
                        >
                            <Video size={18} />
                            <span>Video</span>
                        </button>
                    )}
                    {roomType === 'audio' && (
                        <button
                            className={classNames('type-tab', { active: activeTab === 'audio' })}
                            onClick={() => handleTabChange('audio')}
                        >
                            <Music size={18} />
                            <span>Audio</span>
                        </button>
                    )}
                </div>

                {/* Source Options */}
                <div className="source-options">
                    {activeTab === 'video' ? (
                        <>
                            <button className={classNames('source-btn', { active: sourceType === 'youtube' })} onClick={() => { setSourceType('youtube'); setPreview(null); }}>
                                <Youtube size={20} />
                                <span>YouTube</span>
                            </button>
                            <button className={classNames('source-btn', { active: sourceType === 'file' })} onClick={() => { setSourceType('file'); setPreview(null); }}>
                                <Upload size={20} />
                                <span>Upload</span>
                            </button>
                            <button className={classNames('source-btn', { active: sourceType === 'url' })} onClick={() => { setSourceType('url'); setPreview(null); }}>
                                <Link size={20} />
                                <span>Direct URL</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <button className={classNames('source-btn', { active: sourceType === 'spotify' })} onClick={() => { setSourceType('spotify'); setPreview(null); }}>
                                <Disc size={20} />
                                <span>Spotify</span>
                            </button>
                            <button className={classNames('source-btn', { active: sourceType === 'file' })} onClick={() => { setSourceType('file'); setPreview(null); }}>
                                <Upload size={20} />
                                <span>Upload</span>
                            </button>
                            <button className={classNames('source-btn', { active: sourceType === 'url' })} onClick={() => { setSourceType('url'); setPreview(null); }}>
                                <Link size={20} />
                                <span>Direct URL</span>
                            </button>
                        </>
                    )}
                </div>

                {/* Input Area */}
                <div className="input-section">
                    {sourceType === 'file' ? (
                        <div className="file-upload-area" onClick={() => fileInputRef.current?.click()}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                hidden
                                accept={activeTab === 'video' ? "video/*" : "audio/*"}
                                onChange={handleFileChange}
                            />
                            <div className="upload-icon-circle">
                                <Upload size={24} />
                            </div>
                            <p>Click to upload {activeTab} file</p>
                            <span className="sub-text">Supports MP4, WebM, MP3, WAV</span>
                        </div>
                    ) : (
                        <Input
                            placeholder={
                                sourceType === 'youtube' ? "Paste YouTube URL..." :
                                    sourceType === 'spotify' ? "Paste Spotify Track link..." :
                                        sourceType === 'url' ? "Paste URL (video file, YouTube, or streaming site)..." :
                                            "Paste direct media URL..."
                            }
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onBlur={handleUrlBlur}
                            className="media-input"
                            fullWidth
                            autoFocus
                        />
                    )}
                    {error && <div className="error-msg"><AlertCircle size={14} /> {error}</div>}
                </div>

                {/* Preview Section */}
                {preview && (
                    <div className="media-preview">
                        <div className="preview-icon">
                            {preview.source === 'shared_view' ? (
                                <Monitor size={24} />
                            ) : activeTab === 'video' ? (
                                <Video size={24} />
                            ) : (
                                <Music size={24} />
                            )}
                        </div>
                        <div className="preview-info">
                            <h4>{preview.title}</h4>
                            <div className="preview-meta">
                                <span className={classNames('quality-badge', {
                                    'badge-shared-view': preview.source === 'shared_view'
                                })}>
                                    {preview.label || preview.metadata.quality}
                                </span>
                                {preview.metadata.duration && <span>• {preview.metadata.duration}</span>}
                                {preview.metadata.size && <span>• {preview.metadata.size}</span>}
                            </div>
                        </div>
                    </div>
                )}

                <div className="action-footer">
                    <GlowButton
                        size="lg"
                        fullWidth
                        disabled={!preview}
                        onClick={handleConfirm}
                    >
                        <Play size={20} className="mr-2" />
                        {preview?.source === 'shared_view' ? 'Start Shared View' : 'Start Session'}
                    </GlowButton>
                </div>

            </GlassCard>

            {/* Shared View Instruction Modal */}
            {showSharedViewModal && (
                <div className="shared-view-modal-overlay" onClick={() => setShowSharedViewModal(false)}>
                    <div className="shared-view-modal glass-panel" onClick={e => e.stopPropagation()}>
                        <h3>Shared View Setup</h3>
                        <p className="shared-view-instruction">
                            Select the browser tab playing the video<br />
                            and <strong>enable &quot;Share tab audio&quot;</strong>.
                        </p>
                        <p className="shared-view-instruction-sub">
                            For best quality, fullscreen the video in the tab before sharing.
                        </p>
                        <div className="shared-view-modal-actions">
                            <GlowButton variant="secondary" onClick={() => setShowSharedViewModal(false)}>
                                Cancel
                            </GlowButton>
                            <GlowButton onClick={handleSharedViewStart}>
                                Start Sharing
                            </GlowButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MediaSelector;
