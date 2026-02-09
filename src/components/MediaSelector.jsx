import React, { useState, useEffect } from 'react';
import { Video, Youtube, Link, Monitor, ArrowRight } from 'lucide-react';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import Input from './Input';
import classNames from 'classnames';
import { classifyUrl, normalizeYoutubeUrl } from '../lib/urlClassifier';
import './MediaSelector.css';

const MediaSelector = ({ onSelect }) => {
    const [url, setUrl] = useState('');
    const [previewType, setPreviewType] = useState(null);
    const [showSharedViewModal, setShowSharedViewModal] = useState(false);

    // Auto-classify URL on change
    useEffect(() => {
        if (!url.trim()) {
            setPreviewType(null);
            return;
        }
        const type = classifyUrl(url);
        setPreviewType(type);
    }, [url]);

    const handleConfirm = () => {
        if (!previewType) return;

        if (previewType === 'shared') {
            setShowSharedViewModal(true);
        } else {
            let finalUrl = url.trim();

            // Normalize YouTube URLs (Mandatory for browser fix)
            if (previewType === 'youtube') {
                finalUrl = normalizeYoutubeUrl(finalUrl);
                console.log("Normalized YouTube URL:", finalUrl);
            }

            // Direct playback for YouTube / Files
            onSelect({
                url: finalUrl,
                type: previewType, // 'youtube' or 'direct'
                source: previewType === 'youtube' ? 'youtube' : 'url',
                mode: 'sync'
            });
        }
    };

    const handleStartSharedView = () => {
        onSelect({
            url: url.trim(),
            type: 'shared',
            source: 'shared_view',
            mode: 'shared_view'
        });
        setShowSharedViewModal(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && previewType) {
            handleConfirm();
        }
    };

    // Helper for preview UI
    const getPreviewInfo = (type) => {
        switch (type) {
            case 'youtube':
                return {
                    label: 'YouTube Sync',
                    icon: <Youtube size={24} />,
                    colorClass: 'preview-sync',
                    badge: '✅ Native Sync',
                    badgeClass: 'badge-sync',
                    desc: 'Perfect synchronization. All members follow your playback.'
                };
            case 'direct':
                return {
                    label: 'Direct Video Sync',
                    icon: <Video size={24} />,
                    colorClass: 'preview-sync',
                    badge: '✅ Native Sync',
                    badgeClass: 'badge-sync',
                    desc: 'Direct file playback. Synced for everyone.'
                };
            case 'shared':
            default:
                return {
                    label: 'Shared View',
                    icon: <Monitor size={24} />,
                    colorClass: 'preview-shared',
                    badge: '📡 Tab Stream',
                    badgeClass: 'badge-shared',
                    desc: 'You will share your browser tab. Members see your view.'
                };
        }
    };

    const ui = previewType ? getPreviewInfo(previewType) : null;

    return (
        <div className="media-selector-container">
            <GlassCard className="media-selector-card">
                <div className="selector-header">
                    <h2>Select Media</h2>
                    <p>Paste a YouTube link, video URL, or any website</p>
                </div>

                {/* Unified Input */}
                <div className="input-section">
                    <div className="url-input-wrapper">
                        <Input
                            placeholder="Paste YouTube, Video File, or Website URL..."
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="media-input"
                            fullWidth
                            autoFocus
                            icon={<Link size={18} />}
                        />
                    </div>
                </div>

                {/* Smart Preview */}
                {ui && (
                    <div className={classNames("media-preview", ui.colorClass)}>
                        <div className="preview-icon">
                            {ui.icon}
                        </div>
                        <div className="preview-info">
                            <div className="preview-header">
                                <h4>{ui.label}</h4>
                                <span className={classNames("mode-badge", ui.badgeClass)}>
                                    {ui.badge}
                                </span>
                            </div>
                            <p className="preview-meta">
                                {ui.desc}
                            </p>
                        </div>
                    </div>
                )}

                <div className="action-footer">
                    <GlowButton
                        fullWidth
                        size="lg"
                        onClick={handleConfirm}
                        disabled={!previewType}
                    >
                        {previewType === 'shared' ? 'Configure Session' : 'Start Watching'}
                        <ArrowRight size={18} />
                    </GlowButton>
                </div>
            </GlassCard>

            {/* Shared View Modal */}
            {showSharedViewModal && (
                <div className="shared-view-modal-overlay" onClick={() => setShowSharedViewModal(false)}>
                    <div className="shared-view-modal glass-panel" onClick={e => e.stopPropagation()}>
                        <div className="modal-icon-header">
                            <Monitor size={48} className="text-secondary" />
                        </div>
                        <h3>Start Shared View</h3>

                        <div className="instruction-steps">
                            <div className="step">
                                <div className="step-num">1</div>
                                <p>We'll open a <strong>screen share</strong> dialog.</p>
                            </div>
                            <div className="step">
                                <div className="step-num">2</div>
                                <p>Select the <strong>Tab</strong> you want to watch.</p>
                            </div>
                            <div className="step">
                                <div className="step-num">3</div>
                                <p>Ensure <strong>Share audio</strong> is checked.</p>
                            </div>
                        </div>

                        <div className="shared-view-modal-actions">
                            <GlowButton variant="ghost" onClick={() => setShowSharedViewModal(false)}>
                                Cancel
                            </GlowButton>
                            <GlowButton onClick={handleStartSharedView}>
                                Select Tab to Share
                            </GlowButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MediaSelector;
