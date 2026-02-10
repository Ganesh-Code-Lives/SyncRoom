import React, { useEffect, useRef, useState, useMemo } from 'react';
import ReactPlayer from 'react-player';
import { RefreshCw, Maximize, AlertCircle } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import SharedViewPlayer from './SharedViewPlayer';
import './MediaPlayer.css';

// ==========================================
// PURE MEDIA CONTENT COMPONENT (Memoized)
// ==========================================
// Handles the actual video/player logic.
// Re-renders ONLY when media, playback state, or host status changes.
// DOES NOT re-render when children (Chat Overlay) updates.
const MediaContent = React.memo(({ media, playback, isHost, onClearMedia, updatePlayback }) => {
    const playerRef = useRef(null);
    const [showFallback, setShowFallback] = useState(false);

    // Reset fallback on new media ID
    useEffect(() => {
        setShowFallback(false);
    }, [media?.id]);

    // ========================================
    // 1. SHARED VIEW (WebRTC)
    // ========================================
    if (media?.type === 'shared') {
        return (
            <SharedViewPlayer
                media={media}
                isHost={isHost}
                onClearMedia={onClearMedia}
            />
        );
    }

    // ========================================
    // 2. SYNC LOGIC (Common for YouTube & Direct)
    // ========================================
    useEffect(() => {
        if (isHost || !playerRef.current || !media || showFallback) return;

        // Sync Logic
        if (playback.isPlaying) {
            const currentLoc = playerRef.current.getCurrentTime();
            if (currentLoc !== null && typeof currentLoc !== 'undefined') {
                const drift = Math.abs(currentLoc - playback.currentTime);
                if (drift > 0.5) {
                    playerRef.current.seekTo(playback.currentTime, 'seconds');
                }
            }
        }
    }, [playback, isHost, media, showFallback]);

    // Host Handlers
    const handlePlay = () => {
        if (!isHost) return;
        updatePlayback('play', { isPlaying: true, currentTime: playerRef.current?.getCurrentTime() });
    };

    const handlePause = () => {
        if (!isHost) return;
        updatePlayback('pause', { isPlaying: false, currentTime: playerRef.current?.getCurrentTime() });
    };

    const handleProgress = (state) => {
        // Optional sync updates
    };

    // ========================================
    // 3. YOUTUBE RENDERER (Kosmi-Style)
    // ========================================
    if (media?.type === 'youtube') {
        // Extract ID for fallback
        const videoIdMatch = media.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        return (
            <>
                {isHost && (
                    <div className="host-overlay-controls">
                        <button type="button" className="change-media-btn" onClick={onClearMedia} title="Change Media">
                            <RefreshCw size={16} />
                            <span>Change</span>
                        </button>
                    </div>
                )}

                {/* Primary: ReactPlayer (Forced IFrame Mode) */}
                {!showFallback && (
                    <ReactPlayer
                        key={media.id || 'yt-primary'}
                        ref={playerRef}
                        url={media.url}
                        width="100%"
                        height="100%"
                        playing={playback.isPlaying}
                        controls={isHost}
                        onPlay={handlePlay}
                        onPause={handlePause}
                        onProgress={handleProgress}
                        onReady={() => console.log("YouTube Player Ready")}
                        onError={(e) => {
                            console.error("YouTube Player Error, switching to fallback:", e);
                            setShowFallback(true);
                        }}
                        style={!isHost ? { pointerEvents: 'none' } : {}}
                        config={{
                            youtube: {
                                playerVars: {
                                    autoplay: 0,
                                    controls: isHost ? 1 : 0,
                                    playsinline: 1,
                                    modestbranding: 1,
                                    rel: 0
                                }
                            }
                        }}
                    />
                )}

                {/* Safety Net: Raw IFrame (Kosmi-Style Fallback) */}
                {showFallback && videoId && (
                    <iframe
                        key={media.id || 'yt-fallback'}
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=0&controls=${isHost ? 1 : 0}`}
                        allow="autoplay; encrypted-media; fullscreen"
                        allowFullScreen
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            background: 'black',
                            pointerEvents: isHost ? 'auto' : 'none'
                        }}
                    />
                )}

                {/* Member Fullscreen Button */}
                {!isHost && (
                    <button
                        className="member-fs-btn"
                        onClick={() => {
                            const elem = document.querySelector('.media-player-container');
                            if (elem && elem.requestFullscreen) elem.requestFullscreen();
                        }}
                        title="Fullscreen"
                    >
                        <Maximize size={24} />
                    </button>
                )}
            </>
        );
    }

    // ========================================
    // 4. DIRECT FILE RENDERER
    // ========================================
    return (
        <>
            {isHost && (
                <div className="host-overlay-controls">
                    <button type="button" className="change-media-btn" onClick={onClearMedia} title="Change Media">
                        <RefreshCw size={16} />
                        <span>Change</span>
                    </button>
                </div>
            )}

            <ReactPlayer
                key={media?.id || 'direct-player'}
                ref={playerRef}
                url={media?.url}
                width="100%"
                height="100%"
                playing={playback.isPlaying}
                controls={isHost}
                onPlay={handlePlay}
                onPause={handlePause}
                style={!isHost ? { pointerEvents: 'none' } : {}}
                config={{
                    file: {
                        attributes: {
                            controlsList: 'nodownload'
                        }
                    }
                }}
            />

            {!isHost && (
                <button
                    className="member-fs-btn"
                    onClick={() => {
                        const elem = document.querySelector('.media-player-container');
                        if (elem && elem.requestFullscreen) elem.requestFullscreen();
                    }}
                    title="Fullscreen"
                >
                    <Maximize size={24} />
                </button>
            )}
        </>
    );
});


const MediaPlayer = ({ media, isHost, onClearMedia, children }) => {
    const { playback, updatePlayback } = useRoom();

    // Determine container class
    const containerClass = useMemo(() => {
        if (media?.type === 'shared') return 'media-player-container shared-view-mode';
        if (media?.type === 'youtube') return 'media-player-container youtube-mode';
        return 'media-player-container direct-mode';
    }, [media?.type]);

    return (
        <div className={containerClass}>
            <MediaContent
                media={media}
                isHost={isHost}
                playback={playback}
                onClearMedia={onClearMedia}
                updatePlayback={updatePlayback}
            />
            {children}
        </div>
    );
};

export default MediaPlayer;
