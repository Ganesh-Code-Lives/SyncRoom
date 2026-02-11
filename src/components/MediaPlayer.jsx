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

    useEffect(() => {
        // As a Member, we track the Host's time strictly
        if (isHost) return;

        const handleTimeUpdate = (data) => {
            if (media.type !== 'youtube') return;

            const { currentTime, isPlaying } = data;

            // Update our local reference (critical for Host Transfer survival)
            lastKnownTimeRef.current = currentTime;

            // Latency Compensation (Simplified)
            // CAUTION: Assuming a fixed network latency of ~200ms for now.
            const transmissionDelay = 0.2;
            const adjustedServerTime = currentTime + (isPlaying ? transmissionDelay : 0);

            const localTime = playerRef.current.getCurrentTime();
            const drift = Math.abs(localTime - adjustedServerTime);

            // Drift Correction Rule
            if (drift > 0.8) {
                const now = Date.now();
                // THROTTLE: Don't seek if we already sought recently (2s)
                if (now - lastSeekRef.current > 2000) {
                    console.log(`[Sync] Drift detected (${drift.toFixed(2)}s). Correcting.`);
                    playerRef.current.seekTo(adjustedServerTime, 'seconds');
                    lastSeekRef.current = now;
                } else {
                    console.log(`[Sync] Drift ignored (throttled): ${drift.toFixed(2)}s`);
                }
            }
        };

        socket.on('yt_time_update', handleTimeUpdate);

        return () => {
            socket.off('yt_time_update', handleTimeUpdate);
        };
    }, [isHost, media]); // Removed playback.isPlaying dependency to avoid stale closure issues if needed, though data has it.

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
        // If Playing, standard drift check for NON-YouTube (since YT has dedicated socket event)
        else if (media.type !== 'youtube') {
            const currentLoc = playerRef.current.getCurrentTime();
            if (currentLoc !== null && typeof currentLoc !== 'undefined') {
                const drift = Math.abs(currentLoc - playback.currentTime);
                if (drift > 2.0) { // Looser tolerance for generic files
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
                        onProgress={(state) => {
                            // Host Logic: Emit time sync every ~2s (throttled by progress interval)
                            if (isHost && media.type === 'youtube') {
                                const now = Date.now();
                                if (!playerRef.current.lastSyncEmit || now - playerRef.current.lastSyncEmit > 2000) {
                                    socket.emit('yt_time_update', {
                                        roomCode: media.roomCode,
                                        currentTime: state.playedSeconds,
                                        isPlaying: true,
                                        timestamp: now
                                    });
                                    playerRef.current.lastSyncEmit = now;
                                }
                            }
                        }}
                        onReady={() => {
                            console.log("YouTube Player Ready");
                            // INITIAL SYNC: Restore session time
                            // If we just became Host, lastKnownTimeRef has the last time we saw.
                            // If we are a joining Member, playback.currentTime has the snapshot time.

                            const targetTime = isHost ? lastKnownTimeRef.current : playback.currentTime;

                            // If we have a valid target time (> 1s), seek to it.
                            if (targetTime > 1) {
                                console.log(`[Sync] Restoring position to ${targetTime}s`);
                                playerRef.current.seekTo(targetTime, 'seconds');
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
