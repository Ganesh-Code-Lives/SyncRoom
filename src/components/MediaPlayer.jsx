import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw, RefreshCw, Play, Pause, Maximize, Volume2 } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import SharedViewPlayer from './SharedViewPlayer';
import './MediaPlayer.css';

const MediaPlayer = ({ media, isHost, onClearMedia }) => {
    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const { playback, updatePlayback } = useRoom();

    // ========================================
    // STRICT SYNC LOGIC
    // ========================================
    useEffect(() => {
        if (!media) return;
        const element = media.type === 'video' ? videoRef.current : audioRef.current;
        if (!element) return;

        // 1. Sync Play/Pause
        if (playback.isPlaying && element.paused) {
            console.log("SYNC: Forcing PLAY");
            element.play().catch(e => console.log("Autoplay blocked:", e));
        } else if (!playback.isPlaying && !element.paused) {
            console.log("SYNC: Forcing PAUSE");
            element.pause();
        }

        // 2. Sync Time (Drift Correction)
        const checkSync = () => {
            if (isHost) return; // Host is the source of truth

            // Calculate current server time: serverTime + (now - lastUpdate)
            // But simplified: playback.currentTime is the snapshot. 
            // Better: We rely on the periodic updates from server.

            const drift = Math.abs(element.currentTime - playback.currentTime);
            if (drift > 0.35) { // 350ms threshold
                console.log(`SYNC: Drift detected (${drift.toFixed(3)}s). Correcting to ${playback.currentTime}`);
                element.currentTime = playback.currentTime;
            }
        };

        // Run sync check every 1s (Server broadcasts updates too)
        const interval = setInterval(checkSync, 1000);

        // Immediate reaction to "lastAction" if needed (handled by state change)

        return () => clearInterval(interval);

    }, [playback, media, isHost]);

    // Handle Local Events (Host Only)
    const handleLocalPlay = () => {
        if (!isHost) {
            // Revert if viewer tries to play
            const element = media.type === 'video' ? videoRef.current : audioRef.current;
            if (element) element.pause();
            return;
        }
        updatePlayback('play', { isPlaying: true, currentTime: videoRef.current?.currentTime });
    };

    const handleLocalPause = () => {
        if (!isHost) {
            const element = media.type === 'video' ? videoRef.current : audioRef.current;
            if (element) element.play().catch(() => { });
            return;
        }
        updatePlayback('pause', { isPlaying: false, currentTime: videoRef.current?.currentTime });
    };

    const handleLocalSeek = (e) => {
        if (!isHost) return; // Viewers cannot seek
        // Seek logic handled by UI controls
    };

    console.log("MediaPlayer mounting with:", media);

    // Common Controls (Host Only)
    const renderHostControls = () => {
        if (!isHost) return null;
        return (
            <button className="change-media-btn" onClick={onClearMedia} title="Change Media">
                <RefreshCw size={18} />
                <span>Change Media</span>
            </button>
        );
    };

    // Seek Controls (Native Only)
    const renderSeekControls = () => {
        if (media.source === 'youtube') return null; // YouTube has its own controls
        return (
            <div className="custom-seek-controls">
                <button onClick={() => handleSeek(-10)} title="-10s" className="seek-btn">
                    <RotateCcw size={20} />
                </button>
                <button onClick={() => handleSeek(10)} title="+10s" className="seek-btn">
                    <RotateCw size={20} />
                </button>
            </div>
        );
    };

    // 0. Shared View Mode (Kosmi-style tab capture)
    if (media.type === 'video' && media.source === 'shared_view') {
        return (
            <SharedViewPlayer
                media={media}
                isHost={isHost}
                onClearMedia={onClearMedia}
            />
        );
    }

    // 1. YouTube Player
    if (media.type === 'video' && media.source === 'youtube') {
        const playerRef = useRef(null);
        const [isReady, setIsReady] = useState(false);
        const queuedSyncRef = useRef(null);
        const playbackRef = useRef(playback);
        playbackRef.current = playback;

        const getYoutubeId = (url) => {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
            const match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
        };
        const videoId = getYoutubeId(media.url);

        // HOST ONLY: onStateChange - members use no-op, never emit
        const onPlayerStateChange = (event) => {
            if (!isHost) return;
            const state = event.data;
            const time = event.target.getCurrentTime();
            if (state === 1) {
                updatePlayback('play', { isPlaying: true, currentTime: time });
            } else if (state === 2) {
                updatePlayback('pause', { isPlaying: false, currentTime: time });
            }
        };

        const onPlayerReady = (event) => {
            const player = event.target;
            setIsReady(true);

            // Apply server state only - no autoplay. Seek first, then play/pause per server.
            const syncToApply = queuedSyncRef.current || playback;
            const currentTime = syncToApply.currentTime ?? 0;
            if (currentTime > 0) {
                player.seekTo(currentTime, true);
            }
            if (syncToApply.isPlaying) {
                player.playVideo();
            } else {
                player.pauseVideo();
            }
            queuedSyncRef.current = null;
        };

        // Load YouTube API
        useEffect(() => {
            if (!window.YT) {
                const tag = document.createElement('script');
                tag.src = "https://www.youtube.com/iframe_api";
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            }

            const initPlayer = () => {
                if (!videoId) return;

                if (playerRef.current) {
                    playerRef.current.destroy();
                }

                playerRef.current = new window.YT.Player('youtube-player', {
                    height: '100%',
                    width: '100%',
                    videoId: videoId,
                    playerVars: {
                        'playsinline': 1,
                        'controls': isHost ? 1 : 0,
                        'disablekb': !isHost ? 1 : 0,
                        'rel': 0,
                        'modestbranding': 1,
                        'origin': window.location.origin
                    },
                    events: {
                        'onReady': onPlayerReady,
                        'onStateChange': isHost ? onPlayerStateChange : () => {}
                    }
                });
            };

            if (window.YT && window.YT.Player) {
                initPlayer();
            } else {
                window.onYouTubeIframeAPIReady = initPlayer;
            }

            return () => {
                if (playerRef.current && playerRef.current.destroy) {
                    try { playerRef.current.destroy(); } catch (e) { }
                }
            };
        }, [videoId, isHost]);

        // Sync Logic for YouTube - PLAYER READY GATE + SERVER AUTHORITY
        useEffect(() => {
            if (!playerRef.current || !playerRef.current.getPlayerState) return;

            const player = playerRef.current;

            // PLAYER READY GATE: queue sync if not ready, do not apply
            if (!isReady) {
                queuedSyncRef.current = { ...playback };
                return;
            }

            if (!player.playVideo || !player.pauseVideo) return;

            // MEMBERS: Server state is final. If server says pause, ALWAYS pause - never play.
            if (!isHost) {
                if (!playback.isPlaying) {
                    player.pauseVideo();
                } else {
                    const playerState = player.getPlayerState();
                    if (playerState === 2 || playerState === -1 || playerState === 5) {
                        player.playVideo();
                    }
                }
                const drift = Math.abs(player.getCurrentTime() - playback.currentTime);
                if (drift > 0.5) {
                    player.seekTo(playback.currentTime, true);
                }
                return;
            }

            // HOST: sync play/pause from host's local actions (already emitted via onStateChange)
            const playerState = player.getPlayerState();
            if (playback.isPlaying && (playerState === 2 || playerState === -1 || playerState === 5)) {
                player.playVideo();
            } else if (!playback.isPlaying && playerState === 1) {
                player.pauseVideo();
            }
            const drift = Math.abs(player.getCurrentTime() - playback.currentTime);
            if (drift > 0.5) {
                player.seekTo(playback.currentTime, true);
            }
        }, [playback, isReady, isHost]);

        // SERVER STATE OVERRIDE: Every 3s, force pause if server says pause (members only)
        useEffect(() => {
            if (isHost) return;

            const interval = setInterval(() => {
                const p = playerRef.current;
                if (!p || !p.getPlayerState || !p.pauseVideo) return;
                if (!playbackRef.current.isPlaying && p.getPlayerState() === 1) {
                    p.pauseVideo();
                }
            }, 3000);
            return () => clearInterval(interval);
        }, [isHost]);

        return (
            <div className="media-player-container youtube-mode">
                {renderHostControls()}
                {/* Overlay for viewers to prevent clicking */}
                {!isHost && <div className="youtube-blocker" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 10,
                    background: 'transparent' // Invisible blocker
                }} title="Only host controls playback" />}

                <div id="youtube-player" className="youtube-iframe"></div>
            </div>
        );
    }

    // 2. Custom Video Player (File or URL) - Replaces native controls with custom UI
    if (media.type === 'video' && (media.source === 'file' || media.source === 'url')) {
        const [isPlaying, setIsPlaying] = React.useState(false);
        const [progress, setProgress] = React.useState(0);
        const [currentTime, setCurrentTime] = React.useState(0);
        const [duration, setDuration] = React.useState(0);
        const [volume, setVolume] = React.useState(1);
        const [showControls, setShowControls] = React.useState(true);
        const controlsTimeoutRef = useRef(null);

        // Sync Playback: autoplay DISABLED - server-authoritative, host controls
        useEffect(() => {
            if (videoRef.current && media.source === 'file') {
                videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
            }
        }, [media.url, media.source]);

        const togglePlay = (e) => {
            e.stopPropagation();
            if (!isHost) return; // Host only
            if (videoRef.current) {
                if (isPlaying) {
                    videoRef.current.pause();
                } else {
                    videoRef.current.play();
                }
                setIsPlaying(!isPlaying);
            }
        };

        const skip = (seconds) => {
            if (!isHost) return; // Host only
            if (videoRef.current) {
                videoRef.current.currentTime += seconds;
            }
        };

        const handleTimeUpdate = () => {
            if (videoRef.current) {
                const current = videoRef.current.currentTime;
                const total = videoRef.current.duration;
                setCurrentTime(current);
                setDuration(total || 0);
                setProgress(total ? (current / total) * 100 : 0);

                if (current >= total && total > 0) setIsPlaying(false);
            }
        };

        const handleSeekScrub = (e) => {
            e.stopPropagation();
            if (!isHost) return; // Host only
            const bar = e.currentTarget;
            const rect = bar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
                const newTime = pos * videoRef.current.duration;
                videoRef.current.currentTime = newTime;
                setProgress(pos * 100);
            }
        };

        const handleVolumeChange = (e) => {
            e.stopPropagation();
            const newVolume = parseFloat(e.target.value);
            setVolume(newVolume);
            if (videoRef.current) {
                videoRef.current.volume = newVolume;
            }
        };

        const toggleFullscreen = (e) => {
            e.stopPropagation();
            const container = document.querySelector('.media-player-container');
            if (!document.fullscreenElement) {
                container?.requestFullscreen().catch(err => console.error(err));
            } else {
                document.exitFullscreen();
            }
        };

        const formatTime = (time) => {
            if (!time || isNaN(time)) return "0:00";
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        };

        const handleMouseMove = () => {
            setShowControls(true);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            if (isPlaying) {
                controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
            }
        };

        const handleMouseLeave = () => {
            if (isPlaying) setShowControls(false);
        };

        return (
            <div
                className="media-player-container video-mode group"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >

                {/* Header Overlay */}
                <div className={`player-header-overlay ${showControls ? 'visible' : ''}`}>
                    <div>
                        <h3 className="media-title">{media.metadata?.title || 'Unknown Media'}</h3>
                        <span className="live-badge">
                            <span className="live-dot"></span> Live
                        </span>
                    </div>
                    {isHost && (
                        <button className="change-media-btn-small" onClick={onClearMedia} title="Change Media">
                            <RefreshCw size={16} /> Change
                        </button>
                    )}
                </div>

                {/* Main Video Element */}
                <div
                    className="video-wrapper"
                    onClick={togglePlay}
                    title={!isHost ? "Only host controls playback" : ""}
                    style={{ cursor: isHost ? 'pointer' : 'default' }}
                >
                    <video
                        ref={videoRef}
                        src={media.url}
                        className="native-video custom-controls-video"
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={(e) => {
                            setDuration(e.target.duration);
                            // Attempt to ensure it's ready
                            if (isPlaying) e.target.play().catch(console.error);
                        }}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                        onError={(e) => console.error("Video Error:", e.nativeEvent)}
                        playsInline
                        muted={false} // Ensure audio is enabled
                    />

                    {/* Big Play Button Overlay */}
                    {!isPlaying && (
                        <div className="big-play-overlay">
                            <div className="big-play-btn" style={{ opacity: isHost ? 1 : 0.5 }}>
                                <Play size={40} fill="white" className="play-icon" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Custom Bottom Control Bar */}
                <div className={`custom-control-bar ${showControls ? 'visible' : ''}`}>
                    {/* Progress Bar */}
                    <div
                        className="progress-container"
                        onClick={handleSeekScrub}
                        style={{ cursor: isHost ? 'pointer' : 'default' }}
                    >
                        <div className="progress-bar-bg">
                            <div
                                className="progress-bar-fill"
                                style={{ width: `${progress}%`, background: isHost ? '#3b82f6' : '#64748b' }}
                            />
                            {isHost && (
                                <div
                                    className="progress-thumb"
                                    style={{ left: `${progress}%` }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Controls Row */}
                    <div className="controls-row">
                        <div className="controls-left">
                            <button
                                className="control-icon-btn"
                                onClick={togglePlay}
                                disabled={!isHost}
                                style={{ opacity: isHost ? 1 : 0.5, cursor: isHost ? 'pointer' : 'not-allowed' }}
                            >
                                {isPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" />}
                            </button>

                            <button
                                className="control-icon-btn"
                                onClick={(e) => { e.stopPropagation(); skip(-10); }}
                                title="-10s"
                                disabled={!isHost}
                                style={{ opacity: isHost ? 1 : 0.5, cursor: isHost ? 'pointer' : 'not-allowed' }}
                            >
                                <RotateCcw size={20} />
                            </button>
                            <button
                                className="control-icon-btn"
                                onClick={(e) => { e.stopPropagation(); skip(10); }}
                                title="+10s"
                                disabled={!isHost}
                                style={{ opacity: isHost ? 1 : 0.5, cursor: isHost ? 'pointer' : 'not-allowed' }}
                            >
                                <RotateCw size={20} />
                            </button>

                            <span className="time-display">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                        </div>

                        <div className="controls-right">
                            {/* Volume */}
                            <div className="volume-control">
                                {/* Simple volume range */}
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={volume}
                                    onChange={handleVolumeChange}
                                    className="volume-slider"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>

                            <button className="control-icon-btn" onClick={toggleFullscreen} title="Fullscreen">
                                <Maximize size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 3. Audio Player
    if (media.type === 'audio') {
        return (
            <div className="media-player-container audio-mode">
                {renderHostControls()}
                {/* Visualizer / Art Placeholder */}
                <div className="audio-visual">
                    <img
                        src={media.metadata?.cover || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&q=80"}
                        alt="Audio Cover"
                        className="audio-cover-art"
                    />
                    <div className="audio-meta">
                        <h3>{media.metadata?.title || "Unknown Track"}</h3>
                        <p>{media.metadata?.artist || "Unknown Artist"}</p>
                    </div>
                </div>

                {media.source === 'spotify' ? (
                    <div className="spotify-embed-placeholder">
                        <p>Spotify Playback requires Premium SDK. <br /> <a href={media.url} target="_blank" rel="noreferrer">Open in Spotify</a></p>
                    </div>
                ) : (
                    <>
                        <audio
                            ref={audioRef}
                            src={media.url}
                            controls
                            autoPlay
                            className="native-audio"
                        />
                        {renderSeekControls()}
                    </>
                )}
            </div>
        );
    }

    return <div className="media-error">Unsupported Media Type</div>;
};

export default MediaPlayer;
