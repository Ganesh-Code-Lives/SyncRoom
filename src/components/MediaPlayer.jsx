import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { RefreshCw, Maximize, AlertCircle } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import SharedViewPlayer from './SharedViewPlayer';
import './MediaPlayer.css';

const MediaPlayer = ({ media, isHost, onClearMedia, children }) => {
    const playerRef = useRef(null);
    const { playback, updatePlayback } = useRoom();
    const [showFallback, setShowFallback] = useState(false);

    // DEBUG: Check canPlay
    useEffect(() => {
        if (media?.url) {
            const playable = ReactPlayer.canPlay(media.url);
            console.log(`[MediaPlayer] URL: ${media.url}, canPlay: ${playable}`);
        }
    }, [media?.url]);

    // Reset fallback on new media ID
    useEffect(() => {
        setShowFallback(false);
    }, [media?.id]);



    // ========================================
    // 1. SHARED VIEW (WebRTC)
    // ========================================
    if (media?.type === 'shared') {
        return (
            <div className="media-player-container shared-view-mode">
                {isHost && (
                    <div className="host-overlay-controls">
                        <button className="change-media-btn" onClick={onClearMedia} title="Change Media">
                            <RefreshCw size={16} />
                            <span>Stop Sharing</span>
                        </button>
                    </div>
                )}
                <SharedViewPlayer
                    media={media}
                    isHost={isHost}
                    onClearMedia={onClearMedia}
                />
                {children}
            </div>
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
            <div className="media-player-container youtube-mode">

                {isHost && (
                    <div className="host-overlay-controls">
                        <button className="change-media-btn" onClick={onClearMedia} title="Change Media">
                            <RefreshCw size={16} />
                            <span>Change</span>
                        </button>
                    </div>
                )}

                {/* Primary: ReactPlayer (Forced IFrame Mode) */}
                {!showFallback && (
                    <ReactPlayer
                        key={media.id || 'yt-primary'} // 🚨 REQUIRED — forces full remount
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
                            if (elem.requestFullscreen) elem.requestFullscreen();
                        }}
                        title="Fullscreen"
                    >
                        <Maximize size={24} />
                    </button>
                )}
                {children}
            </div>
        );
    }

    // ========================================
    // 4. DIRECT FILE RENDERER
    // ========================================
    return (
        <div className="media-player-container direct-mode">

            {isHost && (
                <div className="host-overlay-controls">
                    <button className="change-media-btn" onClick={onClearMedia} title="Change Media">
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
                        if (elem.requestFullscreen) elem.requestFullscreen();
                    }}
                    title="Fullscreen"
                >
                    <Maximize size={24} />
                </button>
            )}
            {children}
        </div>
    );
};

export default MediaPlayer;
