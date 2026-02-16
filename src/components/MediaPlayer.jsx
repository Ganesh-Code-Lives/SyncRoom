import React, { useEffect, useRef, useState, useMemo } from 'react';
import ReactPlayer from 'react-player';
import { RefreshCw, Maximize, AlertCircle } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import SharedViewPlayer from './SharedViewPlayer';
import { socket } from '../lib/socket';
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
    const { room } = useRoom();

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
    // 2. SYNC LOGIC (Server-Authoritative Mirror)
    // ========================================
    const lastLocalTimeRef = useRef(0);

    // --- HOST SIDE: Event Broadcaster ---
    const sendYtEvent = (type, payload = {}) => {
        if (!playerRef.current || !isHost) return;

        socket.emit('yt_event', {
            roomCode: room?.code,
            type,
            payload: {
                currentTime: playerRef.current.getCurrentTime() || 0,
                isPlaying: playback.isPlaying,
                playbackRate: playerRef.current.getInternalPlayer()?.getPlaybackRate() || 1,
                ...payload
            }
        });
    };

    // --- MEMBER SIDE: Absolute Authority Sync ---
    useEffect(() => {
        if (isHost || media?.type !== 'youtube') return;

        const handleSyncUpdate = (data) => {
            if (!playerRef.current) return;

            const ytPlayer = playerRef.current.getInternalPlayer();
            const now = Date.now();

            // 1. Latency Compensation
            const latency = (now - data.timestamp) / 1000;
            const adjustedTime = data.currentTime + (data.isPlaying ? (latency * data.playbackRate) : 0);

            const localTime = playerRef.current.getCurrentTime() || 0;
            const drift = Math.abs(localTime - adjustedTime);

            // 2. Strict State Sync
            if (data.isPlaying && !playback.isPlaying) {
                ytPlayer?.playVideo();
            } else if (!data.isPlaying && playback.isPlaying) {
                ytPlayer?.pauseVideo();
            }

            // 3. Playback Rate Sync
            if (ytPlayer?.getPlaybackRate() !== data.playbackRate) {
                ytPlayer?.setPlaybackRate(data.playbackRate);
            }

            // 4. Hard Snap Only (0.4s threshold — ignore minor drift)
            if (drift > 0.4) {
                console.log(`[Sync] Server Snap: ${drift.toFixed(3)}s`);
                playerRef.current.seekTo(adjustedTime, 'seconds');
            }
        };

        socket.on('yt_sync_update', handleSyncUpdate);
        return () => socket.off('yt_sync_update', handleSyncUpdate);
    }, [isHost, media?.id, playback.isPlaying]);

    // Standard Playback State Sync (Redundant check but good for non-YT types & PAUSE SYNC)
    useEffect(() => {
        if (isHost || !playerRef.current || !media || showFallback || media.type === 'youtube') return;

        // If Paused, Force Sync to server time (Strong Consistency)
        if (!playback.isPlaying) {
            const currentLoc = playerRef.current.getCurrentTime();
            if (currentLoc !== null && typeof currentLoc !== 'undefined') {
                const drift = Math.abs(currentLoc - playback.currentTime);
                if (drift > 0.5) {
                    console.log(`[Sync] Pause State Enforcement. Seeking to ${playback.currentTime}`);
                    playerRef.current.seekTo(playback.currentTime, 'seconds');
                }
            }
        }
        // If Playing, standard drift check for Direct Files
        else if (media.type === 'direct') {
            const currentLoc = playerRef.current.getCurrentTime();
            if (currentLoc !== null && typeof currentLoc !== 'undefined') {
                const drift = Math.abs(currentLoc - playback.currentTime);
                if (drift > 2.0) { // Tolerance for direct files
                    console.log(`[Sync] Direct Video Drift: ${drift.toFixed(3)}s. Seeking to ${playback.currentTime}`);
                    playerRef.current.seekTo(playback.currentTime, 'seconds');
                }
            }
        }
    }, [playback, isHost, media, showFallback]);

    // Host Handlers
    const handlePlay = () => {
        if (!isHost) return;
        updatePlayback('play', { isPlaying: true, currentTime: playerRef.current?.getCurrentTime() });
        sendYtEvent('play', { isPlaying: true });
    };

    const handlePause = () => {
        if (!isHost) return;
        updatePlayback('pause', { isPlaying: false, currentTime: playerRef.current?.getCurrentTime() });
        sendYtEvent('pause', { isPlaying: false });
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
                        onProgress={(state) => {
                            if (!isHost || !playerRef.current) return;

                            const currentTime = state.playedSeconds;
                            const timeSinceLast = Math.abs(currentTime - lastLocalTimeRef.current);

                            // Detect manual seek: time jump > 1.5s between progress ticks
                            if (lastLocalTimeRef.current > 0 && timeSinceLast > 1.5) {
                                console.log(`[Host] Seek Detected: ${timeSinceLast.toFixed(2)}s jump → ${currentTime.toFixed(2)}s`);
                                sendYtEvent('seek', { currentTime });
                            }

                            lastLocalTimeRef.current = currentTime;
                        }}
                        onPlaybackRateChange={(rate) => {
                            if (isHost) sendYtEvent('rate_change', { playbackRate: rate });
                        }}
                        onReady={() => {
                            console.log("YouTube Player Ready");
                            if (!isHost && playback) {
                                // Immediate Absolute Snap
                                if (playback.currentTime > 0.5) {
                                    playerRef.current.seekTo(playback.currentTime, 'seconds');
                                }

                                if (playback.isPlaying) {
                                    playerRef.current.getInternalPlayer()?.playVideo();
                                } else {
                                    playerRef.current.getInternalPlayer()?.pauseVideo();
                                }

                                if (playback.playbackRate) {
                                    playerRef.current.getInternalPlayer()?.setPlaybackRate(playback.playbackRate);
                                }
                            } else if (isHost && playback.currentTime > 0) {
                                playerRef.current.seekTo(playback.currentTime, 'seconds');
                            }
                        }}
                        onError={(e) => {
                            console.error("YouTube Player Error:", e);
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
                onReady={() => {
                    console.log("[DirectPlayer] Ready");
                    if (!isHost && playback.currentTime > 0.5) {
                        console.log(`[DirectPlayer] Ready Sync: Seeking to ${playback.currentTime}`);
                        playerRef.current?.seekTo(playback.currentTime, 'seconds');
                    }
                }}
                onProgress={(state) => {
                    if (isHost && playback.isPlaying) {
                        // Periodic update for direct files (less aggressive than YT)
                        const now = Date.now();
                        if (!playerRef.current.lastDirectSync || now - playerRef.current.lastDirectSync > 2000) {
                            updatePlayback('sync', {
                                isPlaying: true,
                                currentTime: state.playedSeconds
                            });
                            playerRef.current.lastDirectSync = now;
                        }
                    }
                }}
                style={!isHost ? { pointerEvents: 'none' } : {}}
                config={{
                    file: {
                        attributes: {
                            controlsList: 'nodownload',
                            playsInline: true,
                            crossOrigin: 'anonymous'
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

export default React.memo(MediaPlayer);
