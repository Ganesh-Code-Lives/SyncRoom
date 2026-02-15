import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { socket } from '../lib/socket';
import { sfuClient } from '../lib/sfuClient';
import './SharedViewPlayer.css';

const SharedViewPlayerView = React.memo(({ isHost, roomCode, hostId, onClearMedia }) => {
    const videoRef = useRef(null);
    const [status, setStatus] = useState(isHost ? 'idle' : 'waiting');
    const [error, setError] = useState(null);
    const activeConsumersRef = useRef(new Set());
    const statusRef = useRef(status);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    const stopSharing = useCallback(() => {
        sfuClient.close();
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
            await sfuClient.init(roomCode);
            console.log("[SFU] Host sfuClient init OK");

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { max: 1920, ideal: 1920 },
                    height: { max: 1080, ideal: 1080 },
                    frameRate: { max: 30, ideal: 30 }
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 2,
                    sampleRate: 48000,
                    sampleSize: 16,
                    latency: 0
                }
            });

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

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            console.log("[SFU] Producing tracks...");
            for (const track of stream.getTracks()) {
                console.log(`[SFU] Producing ${track.kind} track...`);
                const producer = await sfuClient.produce(track);

                if (producer.rtpSender) {
                    try {
                        const params = producer.rtpSender.getParameters();
                        if (!params.encodings) params.encodings = [{}];

                        if (track.kind === 'video') {
                            params.encodings[0].maxBitrate = 2000000; // 2Mbps
                            console.log("[SFU] Video bitrate capped at 2Mbps");
                        } else if (track.kind === 'audio') {
                            params.encodings[0].maxBitrate = 128000; // 128kbps Opus
                            params.encodings[0].priority = 'high';
                            console.log("[SFU] Audio bitrate set to 128kbps (High Priority)");
                        }

                        await producer.rtpSender.setParameters(params);
                    } catch (e) {
                        console.warn(`[SFU] Failed to set bitrate for ${track.kind}:`, e);
                    }
                }
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
    }, [isHost, roomCode, hostId, stopSharing, status]);

    const consumeProducer = useCallback(async (producerId) => {
        if (activeConsumersRef.current.has(producerId)) return;
        activeConsumersRef.current.add(producerId);

        try {
            console.log(`[SFU] Consuming producer: ${producerId}`);
            const consumer = await sfuClient.consume(producerId);

            if (consumer.kind === 'video') {
                console.log(`[SFU] Attaching video track: ${consumer.track.id}`);
                const stream = new MediaStream([consumer.track]);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    try {
                        await videoRef.current.play();
                        console.log("[SFU] Video playback started successfully");
                        setStatus('playing');
                    } catch (playErr) {
                        console.error("[SFU] Video play failed:", playErr);
                        setStatus('playing');
                    }
                }
            } else if (consumer.kind === 'audio') {
                console.log(`[SFU] Attaching audio track: ${consumer.track.id}`);
                if (videoRef.current && videoRef.current.srcObject) {
                    videoRef.current.srcObject.addTrack(consumer.track);
                } else if (videoRef.current) {
                    videoRef.current.srcObject = new MediaStream([consumer.track]);
                }
            }
        } catch (err) {
            console.error(`[SFU] Failed to consume producer ${producerId}:`, err);
            activeConsumersRef.current.delete(producerId);
        }
    }, []);

    useEffect(() => {
        if (isHost || !roomCode) return;

        const initSfu = async () => {
            let connectionTimeout;
            try {
                console.log("[SFU] Member joining room: " + roomCode);
                setStatus('connecting');

                // Set a 15s timeout for initial connection
                connectionTimeout = setTimeout(() => {
                    if (statusRef.current === 'connecting') {
                        console.error("[SFU] Connection timeout - no producers or init failed");
                        setError("Connection timed out. heavy traffic or firewall issue.");
                        setStatus('idle');
                    }
                }, 15000);

                await sfuClient.init(roomCode);
                console.log("[SFU] sfuClient init finished, waiting for producers...");

                // Clear timeout if we successfully initialized (waiting for producers is a separate state)
                // actually, we stay in 'connecting' until producers arrive? 
                // No, let's keep the timeout running until we actually get a producer OR 
                // we switch to 'waiting' state.

                // If we are still connecting after init, we are just waiting for the first producer
                // The 4s timeout below is for "switching to waiting if empty", 
                // but the 15s timeout is a "hard fail" if nothing happens at all.

                setTimeout(() => {
                    if (statusRef.current === 'connecting' && activeConsumersRef.current.size === 0) {
                        console.log("[SFU] No producers arrived yet, setting to waiting");
                        setStatus('waiting');
                        clearTimeout(connectionTimeout); // We are safe, just waiting
                    }
                }, 4000);
            } catch (err) {
                console.error("[SFU] Member Init failed:", err);
                setError("Connection connection failed. " + (err.message || err));
                setStatus('idle');
            } finally {
                // If we reached here without erroring out, we might still be 'connecting'
                // The timeout inside the try block handles the hang.
            }
        };

        const onExistingProducers = async ({ producerIds }) => {
            console.log(`[SFU] Existing producers detected: ${producerIds.length}`);
            for (const id of producerIds) {
                await consumeProducer(id);
            }
        };

        const onNewProducer = ({ producerId }) => {
            console.log(`[SFU] New producer: ${producerId}`);
            consumeProducer(producerId);
        };

        const onConsumerClosed = ({ consumerId }) => {
            console.log(`[SFU] Consumer closed: ${consumerId}`);
            if (activeConsumersRef.current.size === 0) setStatus('waiting');
        };

        const onStopped = () => {
            console.log("[SFU] Host stopped sharing");
            setStatus('stopped');
            if (videoRef.current) videoRef.current.srcObject = null;
            activeConsumersRef.current.clear();
            onClearMedia?.();
        };

        const onDisconnect = () => {
            console.log("[SFU] Socket disconnected - Stopping share state");
            if (isHost && status === 'sharing') {
                stopSharing();
            }
        };

        socket.on('existing-producers', onExistingProducers);
        socket.on('new_producer', onNewProducer);
        socket.on('consumer_closed', onConsumerClosed);
        socket.on('screen_share_stopped', onStopped);
        socket.on('disconnect', onDisconnect);

        initSfu();

        return () => {
            socket.off('existing-producers', onExistingProducers);
            socket.off('new_producer', onNewProducer);
            socket.off('consumer_closed', onConsumerClosed);
            socket.off('screen_share_stopped', onStopped);
            socket.off('disconnect', onDisconnect);
            sfuClient.close();
        };
    }, [isHost, roomCode, consumeProducer, onClearMedia]);

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

            {status !== 'playing' && status !== 'sharing' && (
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
