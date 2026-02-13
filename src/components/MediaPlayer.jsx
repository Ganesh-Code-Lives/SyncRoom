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
    // ========================================
    // 2. SYNC LOGIC (YouTube Time Update & Drift Correction)
    // ========================================
    const lastSeekRef = useRef(0);
    const lastKnownTimeRef = useRef(0); // Track authoritative time locally to survive host-switch reloads
    const lastServerUpdateTime = useRef(0);
    const lastServerCurrentTime = useRef(0);
    const lastCorrectionTimeRef = useRef(0);

    useEffect(() => {
        // As a Member, we track the Host's time strictly
        if (isHost) return;

        const handleTimeUpdate = (data) => {
            if (media.type !== 'youtube') return;

            const now = Date.now();
            const { currentTime, isPlaying, timestamp } = data;

            // Store authoritative state (critical for extrapolation)
            lastServerUpdateTime.current = timestamp || now;
            lastServerCurrentTime.current = currentTime;
            lastKnownTimeRef.current = currentTime;

            // 1. Latency Compensation
            const latency = (now - (timestamp || now)) / 1000;
            const targetTime = currentTime + (isPlaying ? latency : 0);

            // 2. Drift Check
            const localTime = playerRef.current?.getCurrentTime() || 0;
            const drift = Math.abs(localTime - targetTime);

            // Thresholds (Refined)
            const SOFT_THRESHOLD = 0.30;
            const COOLDOWN = 1500;

            if (drift > SOFT_THRESHOLD) {
                // Anti-Oscillation
                if (now - lastCorrectionTimeRef.current < COOLDOWN) {
                    console.log(`[Sync] Drift ignored (cooldown): ${drift.toFixed(3)}s`);
                    return;
                }

                // Double-Seek Prevention
                if (Math.abs(localTime - targetTime) < 0.25) {
                    return;
                }

                console.log(`[Sync] Correcting drift: ${drift.toFixed(3)}s -> ${targetTime.toFixed(3)}s`);

                playerRef.current.seekTo(targetTime, 'seconds');
                lastCorrectionTimeRef.current = now;
            }
        };

        socket.on('yt_time_update', handleTimeUpdate);

        return () => {
            socket.off('yt_time_update', handleTimeUpdate);
        };
    }, [isHost, media]);

    // ========================================
    // 2b. LOCAL DRIFT MONITOR (Advanced Stabilization)
    // ========================================
    useEffect(() => {
        // Only run for Members watching YouTube
        if (isHost || !media || media.type !== 'youtube' || !playback.isPlaying) return;

        const interval = setInterval(() => {
            const now = Date.now();

            // Respect cooldown
            if (now - lastCorrectionTimeRef.current < 1500) return;

            // Extrapolate server time
            if (lastServerUpdateTime.current === 0) return;

            const timePassed = (now - lastServerUpdateTime.current) / 1000;
            if (timePassed > 5) return;

            const expectedTime = lastServerCurrentTime.current + timePassed;
            const localTime = playerRef.current?.getCurrentTime() || 0;
            const drift = Math.abs(localTime - expectedTime);

            // Tighter check for local monitoring
            if (drift > 0.35) {
                console.log(`[Sync] Local Monitor Drift: ${drift.toFixed(3)}s`);
                playerRef.current.seekTo(expectedTime, 'seconds');
                lastCorrectionTimeRef.current = now;
            }
        }, 500);

        return () => clearInterval(interval);
    }, [isHost, media, playback.isPlaying]);

    // Standard Playback State Sync (Redundant check but good for non-YT types & PAUSE SYNC)
    useEffect(() => {
        if (isHost || !playerRef.current || !media || showFallback) return;

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
                        onSeek={() => {
                            // Track manual seeks for precedence
                            lastSeekRef.current = Date.now();
                        }}
                        onProgress={(state) => {
                            // Host Logic: Optimized Emit
                            if (isHost && media.type === 'youtube') {
                                const now = Date.now();

                                // Interval: 1000ms
                                if (!playerRef.current.lastSyncEmit || now - playerRef.current.lastSyncEmit > 1000) {

                                    // Condition: Playing OR Recently Seeked (< 3s)
                                    const recentlySeeked = (now - lastSeekRef.current) < 3000;

                                    if (playback.isPlaying || recentlySeeked) {
                                        const currentTime = state.playedSeconds;
                                        const lastEmitTime = playerRef.current.lastEmitTime || 0;

                                        // Condition: Delta Check > 0.25s (Avoid jittery/redundant updates)
                                        if (Math.abs(currentTime - lastEmitTime) > 0.25) {
                                            socket.emit('yt_time_update', {
                                                roomCode: media.roomCode,
                                                currentTime: currentTime,
                                                isPlaying: true, // If progress is firing, we are inherently playing
                                                timestamp: now
                                            });
                                            playerRef.current.lastSyncEmit = now;
                                            playerRef.current.lastEmitTime = currentTime;

                                            // Update refs for host transfer safety
                                            lastKnownTimeRef.current = currentTime;
                                        }
                                    }
                                }
                            }
                        }}
                        onReady={() => {
                            console.log("YouTube Player Ready");

                            if (isHost) {
                                // Restore last known time if we just became host
                                if (lastKnownTimeRef.current > 0) {
                                    playerRef.current.seekTo(lastKnownTimeRef.current, 'seconds');
                                }
                            } else {
                                // Member: Force Snap to Extrapolated Server Time
                                const now = Date.now();
                                let targetTime = playback.currentTime;

                                // If we have live server data (within last 30s), prefer that over playback prop
                                if (lastServerUpdateTime.current > 0 && (now - lastServerUpdateTime.current) < 30000) {
                                    const timeSinceUpdate = (now - lastServerUpdateTime.current) / 1000;
                                    targetTime = lastServerCurrentTime.current + (playback.isPlaying ? timeSinceUpdate : 0);
                                    console.log(`[Sync] Using Live Extrapolated Time: ${targetTime}`);
                                }

                                // Immediate Seek
                                if (targetTime > 0.5) {
                                    console.log(`[Sync] Ready Snap: ${targetTime.toFixed(2)}s`);
                                    playerRef.current.seekTo(targetTime, 'seconds');
                                }
                            }
                        }}
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

export default MediaPlayer;
