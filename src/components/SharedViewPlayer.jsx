import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { socket } from '../lib/socket';
import { sfuClient } from '../lib/sfuClient';
import './SharedViewPlayer.css';

const SharedViewPlayerView = React.memo(({ isHost, roomCode, hostId, onClearMedia }) => {
    const { currentUser } = useRoom();
    const videoRef = useRef(null);
    const localStreamRef = useRef(null);
    const [status, setStatus] = useState(isHost ? 'idle' : 'waiting');
    const [error, setError] = useState(null);
    const activeConsumersRef = useRef(new Set());
    const statusRef = useRef(status);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    const stopSharing = useCallback(() => {
        sfuClient.terminate();
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        if (roomCode) {
            socket.emit('screen_share_stop', { roomCode });
        }
        setStatus('idle');
        onClearMedia?.();
        if (videoRef.current) videoRef.current.srcObject = null;
    }, [roomCode, onClearMedia]);

    const startCapture = useCallback(async () => {
        if (!isHost || !roomCode) return;
        if (status === 'capturing' || status === 'sharing') return;

        try {
            console.log("[SFU] Host starting capture...");
            setStatus('capturing');

            console.log("[SFU] Host initializing sfuClient...");
            await sfuClient.init(roomCode, currentUser?.oderId);
            console.log("[SFU] Host sfuClient init OK");

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30, max: 30 }
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            localStreamRef.current = stream;

            console.log("[SFU] Stream acquired");

            // --- PROFESSIONAL AUDIO PIPELINE (COMPRESSOR + GAIN) ---
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                try {
                    console.log("[SFU] Initializing Professional Audio Processing...");
                    const audioContext = new AudioContext({ sampleRate: 48000 });
                    const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
                    const gainNode = audioContext.createGain();
                    const compressor = audioContext.createDynamicsCompressor();

                    // Mild compression to prevent clipping with high gain
                    compressor.threshold.setValueAtTime(-10, audioContext.currentTime);
                    compressor.knee.setValueAtTime(20, audioContext.currentTime);
                    compressor.ratio.setValueAtTime(3, audioContext.currentTime);
                    compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
                    compressor.release.setValueAtTime(0.25, audioContext.currentTime);

                    gainNode.gain.value = 1.6; // 1.6x Boost (Safe range)

                    // Chain: Source -> Compressor -> Gain -> Destination
                    source.connect(compressor);
                    compressor.connect(gainNode);

                    const destination = audioContext.createMediaStreamDestination();
                    gainNode.connect(destination);

                    const boostedTrack = destination.stream.getAudioTracks()[0];
                    console.log("[SFU] Audio pipeline active: Compressor -> Gain(1.6x)");

                    // Replace original track with processed track
                    stream.removeTrack(audioTrack);
                    stream.addTrack(boostedTrack);

                } catch (e) {
                    console.error("[SFU] Audio processing failed:", e);
                }
            }
            // --------------------------------------------------------

            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && 'contentHint' in videoTrack) {
                videoTrack.contentHint = 'detail';
            }

            videoTrack.onended = () => {
                console.log("[SFU] Stream ended (onended)");
                stopSharing();
            };

            if (videoRef.current && videoRef.current.srcObject !== stream) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(e => console.warn("[SFU] Video play failed:", e));
            }

            console.log("[SFU] Producing tracks...");
            for (const track of stream.getTracks()) {
                console.log(`[SFU] Producing ${track.kind} track...`);
                await sfuClient.produce(track);
            }
            console.log("[SFU] All tracks produced");

            socket.emit('screen_share_start', { roomCode, userId: hostId });
            setStatus('sharing');
        } catch (err) {
            console.error("[SFU] Host Capture failed:", err);
            if (err.name !== 'NotAllowedError') {
                setError("Failed to share screen. " + (err.message || err));
            }
            setStatus('idle');
        }
    }, [isHost, roomCode, hostId, stopSharing, currentUser?.oderId]);

    const consumeProducer = useCallback(async (producerId) => {
        if (activeConsumersRef.current.has(producerId)) return;
        activeConsumersRef.current.add(producerId);

        try {
            console.log(`[SFU] Consuming producer: ${producerId}`);
            const consumer = await sfuClient.consume(producerId);
            const { track } = consumer;

            if (videoRef.current) {
                // Ensure a stable MediaStream exists
                let stream = videoRef.current.srcObject;
                if (!stream || !(stream instanceof MediaStream)) {
                    stream = new MediaStream([track]);
                    videoRef.current.srcObject = stream;
                } else {
                    // Add the track if not already present
                    if (!stream.getTracks().find(t => t.id === track.id)) {
                        console.log(`[SFU] Adding ${track.kind} track: ${track.id}`);
                        stream.addTrack(track);

                        // RE-ASSIGN srcObject to trigger browser media pipeline refresh
                        // This is a known fix for tracks added to an existing stream not rendering
                        videoRef.current.srcObject = stream;
                    }
                }

                if (track.kind === 'video') {
                    videoRef.current.play().catch(e => {
                        console.warn("[SFU] Autoplay blocked, interaction required:", e);
                        setStatus('autoplay-blocked');
                    });
                    setStatus('playing');
                }
            }
        } catch (err) {
            console.error(`[SFU] Failed to consume producer ${producerId}:`, err);
            activeConsumersRef.current.delete(producerId);
        }
    }, []);

    useEffect(() => {
        if (isHost || !roomCode) return;

        let cancelled = false;

        const fetchProducers = () => {
            console.log("[SFU] Requesting existing producers...");
            socket.emit('get_producers', { roomCode, type: 'media' }, (producers) => {
                if (cancelled) return;
                if (Array.isArray(producers)) {
                    console.log(`[SFU] Fetched ${producers.length} existing producers`);
                    producers.forEach(p => consumeProducer(p.producerId));
                }
            });
        };

        const initSfu = async () => {
            if (!socket.connected || cancelled) {
                console.log("[SFU] Socket not connected or component unmounted, skipping init...");
                return;
            }

            try {
                console.log("[SFU] Member joining room: " + roomCode);
                setStatus('connecting');

                await sfuClient.init(roomCode, currentUser?.oderId);
                if (cancelled) return;

                console.log("[SFU] sfuClient init finished, fetching producers...");
                fetchProducers();

                // Fallback to 'waiting' if no producers arrive within 5s
                setTimeout(() => {
                    if (!cancelled && statusRef.current === 'connecting' && activeConsumersRef.current.size === 0) {
                        console.log("[SFU] No producers found, setting to waiting");
                        setStatus('waiting');
                    }
                }, 5000);
            } catch (err) {
                if (cancelled) return;
                console.error("[SFU] Member Init failed:", err);
                setError("Media initialization failed. " + (err.message || err));
                setStatus('idle');
            }
        };

        // No-op for existing-producers as we use the get_producers callback now
        const onExistingProducers = () => { };

        const onNewProducer = ({ producerId }) => {
            if (cancelled) return;
            console.log(`[SFU] New producer: ${producerId}`);
            consumeProducer(producerId); // Local consumeProducer handles the logic
        };

        const onConsumerClosed = ({ consumerId }) => {
            if (statusRef.current === 'sharing' && activeConsumersRef.current.size === 0) {
                console.log(`[SFU] Last consumer closed: ${consumerId}, waiting for new producers...`);
                setStatus('waiting');
            }
        };

        const onStopped = () => {
            if (cancelled) return;
            console.log("[SFU] Host stopped sharing");
            setStatus('stopped');
            if (videoRef.current) videoRef.current.srcObject = null;
            activeConsumersRef.current.clear();
            onClearMedia?.();
        };

        const onReconnect = async () => {
            if (isHost && localStreamRef.current) {
                console.log("[SFU] Host recovering screen share after reconnect...");
                try {
                    await sfuClient.terminate();
                    await sfuClient.init(roomCode);
                    for (const track of localStreamRef.current.getTracks()) {
                        await sfuClient.produce(track);
                    }
                    setStatus('sharing');
                } catch (e) {
                    console.error("[SFU] Host recovery failed:", e);
                    setStatus('idle');
                }
            } else if (!isHost) {
                console.log("[SFU] Viewer recovering session after reconnect...");
                // Reset activeConsumers so we can re-consume on fresh init
                activeConsumersRef.current.clear();
                initSfu();
            }
        };

        socket.on('existing-producers', onExistingProducers);
        socket.on('new_producer', onNewProducer);
        socket.on('consumer_closed', onConsumerClosed);
        socket.on('screen_share_stopped', onStopped);
        socket.on('connect', onReconnect);

        initSfu();

        return () => {
            console.log("[SFU] SharedViewPlayer effect cleanup - removing listeners only");
            socket.off('existing-producers', onExistingProducers);
            socket.off('new_producer', onNewProducer);
            socket.off('consumer_closed', onConsumerClosed);
            socket.off('screen_share_stopped', onStopped);
            socket.off('connect', onReconnect);
        };
    }, [isHost, roomCode]); // Removed socket.connected to survive flickers

    return (
        <div className="shared-view-container">
            {isHost && (
                <div className="host-controls-overlay">
                    {status === 'sharing' ? (
                        <button className="shared-view-stop-btn" onClick={stopSharing}>
                            <RefreshCw size={18} />
                            <span>Stop Sharing</span>
                        </button>
                    ) : (
                        <div className="start-share-prompt">
                            <h3>Ready to Share</h3>
                            <button className="start-share-btn" onClick={startCapture}>
                                <RefreshCw size={18} />
                                <span>{error ? 'Retry Sharing' : 'Start Screen Share'}</span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="shared-view-video-wrapper">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isHost}
                    volume={1}
                    className="shared-view-video"
                    style={{ objectFit: 'contain', backgroundColor: '#000' }}
                />
            </div>

            <AnimatePresence>
                {status === 'autoplay-blocked' && (
                    <motion.div
                        className="autoplay-blocked-overlay"
                        initial={{ opacity: 0, scale: 0.9, y: "-40%", x: "-50%" }}
                        animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
                        exit={{ opacity: 0, scale: 0.9, y: "-40%", x: "-50%" }}
                    >
                        <p>The stream is ready, but the browser blocked autoplay.</p>
                        <button
                            className="resume-btn"
                            onClick={() => {
                                if (videoRef.current) {
                                    videoRef.current.play()
                                        .then(() => setStatus('playing'))
                                        .catch(console.error);
                                }
                            }}
                        >
                            <RefreshCw size={18} /> Watch Stream
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {status !== 'playing' && status !== 'sharing' && status !== 'autoplay-blocked' && (
                <div className="shared-view-status">
                    {status === 'capturing' && "Preparing Stream..."}
                    {status === 'connecting' && "Connecting to SFU Server..."}
                    {status === 'waiting' && !isHost && "Ready. Waiting for Host..."}
                </div>
            )}

            {error && (
                <div className="host-controls-overlay error-overlay">
                    <div className="start-share-prompt">
                        <p className="error-text">{error}</p>
                        <button className="change-media-btn" onClick={onClearMedia}>
                            Back to Media Selection
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});

export default function SharedViewPlayer({ isHost, onClearMedia }) {
    const { room } = useRoom();
    return (
        <SharedViewPlayerView
            isHost={isHost}
            roomCode={room?.code}
            hostId={room?.hostId}
            onClearMedia={onClearMedia}
        />
    );
}
