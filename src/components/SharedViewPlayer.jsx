import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { socket } from '../lib/socket';
import './SharedViewPlayer.css';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const RTC_CONFIG = { iceServers: ICE_SERVERS };

// ==========================================
// PURE VIEW COMPONENT (Memoized)
// ==========================================
// This component only re-renders if isHost, roomCode, or media identity changes.
// It ignores chat updates, participant list changes (unless critically needed), etc.
const SharedViewPlayerView = React.memo(({ isHost, roomCode, hostId, activeParticipants, onClearMedia }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const peersRef = useRef(new Map());
    const memberPcRef = useRef(null);
    const memberIceQueueRef = useRef([]);
    // Use a ref for participants to avoid re-running effects on every join/leave
    const participantsRef = useRef(activeParticipants);

    // Update participants ref without triggering re-render of this view
    useEffect(() => {
        participantsRef.current = activeParticipants;
    }, [activeParticipants]);

    const [status, setStatus] = useState(isHost ? 'idle' : 'waiting');
    const [error, setError] = useState(null);

    const stopSharing = useCallback(() => {
        const stream = streamRef.current;
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        peersRef.current.forEach(pc => pc.close());
        peersRef.current.clear();
        if (roomCode) {
            socket.emit('screen_share_stop', { roomCode });
        }
        setStatus('idle');
        onClearMedia?.();
    }, [roomCode, onClearMedia]);

    const createOfferForMember = useCallback(async (memberSocketId) => {
        const stream = streamRef.current;
        if (!stream || !roomCode) return;

        // 1. Get or Create PeerConnection
        let pc = peersRef.current.get(memberSocketId);
        let isNew = false;

        if (!pc) {
            console.log(`[SharedView] Creating NEW connection for ${memberSocketId}`);
            pc = new RTCPeerConnection(RTC_CONFIG);
            peersRef.current.set(memberSocketId, pc);
            isNew = true;

            pc.oniceconnectionstatechange = () => {
                if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                    console.log(`[SharedView] Connection failed/disconnected for ${memberSocketId}`);
                    pc.close();
                    peersRef.current.delete(memberSocketId);
                }
            };

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit('screen_share_ice', { to: memberSocketId, candidate: e.candidate });
                }
            };
        } else {
            console.log(`[SharedView] RENEGOTIATING with ${memberSocketId}`);
        }

        // 2. Add Tracks (Only add if not already present)
        const senders = pc.getSenders();
        stream.getTracks().forEach(track => {
            const hasTrack = senders.some(sender => sender.track === track);
            if (!hasTrack) {
                console.log(`[SharedView] Adding track ${track.kind} to ${memberSocketId}`);
                pc.addTrack(track, stream);
            }
        });

        // 3. Create and Send Offer (Force renegotiation)
        try {
            const offer = await pc.createOffer();

            // Increase bitrate for better quality (4 Mbps video)
            const modifiedSdp = offer.sdp.replace(
                /(m=video.*\r\n)/,
                '$1b=AS:4000\r\n'
            );
            offer.sdp = modifiedSdp;

            await pc.setLocalDescription(offer);
            socket.emit('screen_share_offer', { to: memberSocketId, offer });
        } catch (err) {
            console.error(`[SharedView] Failed to create offer for ${memberSocketId}:`, err);
            // If new connection failed, clean up
            if (isNew) {
                pc.close();
                peersRef.current.delete(memberSocketId);
            }
        }
    }, [roomCode]);

    // Host: capture stream
    const startCapture = useCallback(async () => {
        if (!isHost || !roomCode) return;

        try {
            setStatus('capturing');

            let stream;
            try {
                // Try with audio first
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        displaySurface: 'browser', // Hint for tab capture
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 60 }
                    },
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    }
                });
            } catch (audioErr) {
                console.warn("[SharedView] Audio capture failed or cancelled, trying video only...", audioErr);
                // Fallback to video only if first attempt failed (unlikely for getDisplayMedia, but good safety)
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        displaySurface: 'browser',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 60 }
                    },
                    audio: false
                });
            }

            streamRef.current = stream;

            stream.getVideoTracks()[0]?.addEventListener('ended', () => {
                stopSharing();
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            // CRITICAL: Immediately iterate all participants and start negotiation
            // This ensures members who joined BEFORE share starts get the stream
            // Use the REF here to ensure we have latest participants without re-rendering
            const currentParticipants = participantsRef.current;
            console.log(`[SharedView] Stream acquired. Starting negotiation with ${currentParticipants.length} participants.`);

            currentParticipants.forEach(p => {
                // Don't offer to self or if socket ID is missing
                if (p.id && p.id !== socket.id) {
                    createOfferForMember(p.id);
                }
            });

            socket.emit('screen_share_start', {
                roomCode,
                userId: hostId
            });

            setStatus('sharing');
        } catch (err) {
            console.error("Screen Share Error:", err);
            // Only set error if it wasn't a simple user cancellation
            if (err.name !== 'NotAllowedError') {
                setError(err.message || 'Failed to share screen');
            }
            setStatus('idle');
        }
    }, [isHost, roomCode, hostId, stopSharing, createOfferForMember]); // Removed participants from deps

    // Auto-start / Re-negotiate on mount for members
    useEffect(() => {
        if (!isHost && roomCode) {
            console.log('[SharedView] Joining active stream, requesting offer...');
            socket.emit('screen_share_ready', { roomCode });
        }
        // Just clear error if we change host status
        if (!isHost) setError(null);
    }, [isHost, roomCode]);

    // Host: handle member ready - create offer when they request
    useEffect(() => {
        if (!isHost || !roomCode) return;

        const onRequestOffer = ({ memberSocketId }) => {
            // Only answer if we are actually sharing
            if (streamRef.current && status === 'sharing') {
                createOfferForMember(memberSocketId);
            }
        };

        socket.on('screen_share_request_offer', onRequestOffer);
        return () => socket.off('screen_share_request_offer', onRequestOffer);
    }, [isHost, roomCode, status, createOfferForMember]);

    // Host: create offers for current participants (backup for members already in room)
    // We can rely on the startCapture loop mostly, but if status changes to sharing from outside?
    // Actually, startCapture sets status to sharing.
    // If we receive a new participant while sharing, we need to handle it.

    // Host: handle new member joining while sharing
    useEffect(() => {
        if (!isHost) return;

        const onUserJoined = (data) => {
            if (status === 'sharing' && data.socketId && data.socketId !== socket.id) {
                createOfferForMember(data.socketId);
            }
        };

        socket.on('user_joined', onUserJoined);
        return () => socket.off('user_joined', onUserJoined);
    }, [isHost, status, createOfferForMember]);

    // Member: receive stream - full WebRTC flow
    useEffect(() => {
        if (isHost) return;

        const flushIceQueue = async (pc) => {
            while (memberIceQueueRef.current.length > 0) {
                const cand = memberIceQueueRef.current.shift();
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (e) { }
            }
        };

        const handleOffer = async ({ from, offer }) => {
            setStatus('connecting');
            memberIceQueueRef.current = [];

            if (memberPcRef.current) {
                memberPcRef.current.close();
                memberPcRef.current = null;
            }

            const pc = new RTCPeerConnection(RTC_CONFIG);
            memberPcRef.current = pc;

            pc.ontrack = (e) => {
                const stream = e.streams[0];
                if (videoRef.current && stream) {
                    videoRef.current.srcObject = stream;
                    setStatus('playing');
                }
            };

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit('screen_share_ice', { to: from, candidate: e.candidate });
                }
            };

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                await flushIceQueue(pc);

                const answer = await pc.createAnswer();

                // Increase bitrate for better quality on member side
                const modifiedSdp = answer.sdp.replace(
                    /(m=video.*\r\n)/,
                    '$1b=AS:4000\r\n'
                );
                answer.sdp = modifiedSdp;

                await pc.setLocalDescription(answer);
                socket.emit('screen_share_answer', { to: from, answer });
            } catch (err) {
                console.error("[SharedView] Connection failed:", err);
                if (memberPcRef.current) {
                    memberPcRef.current.close();
                    memberPcRef.current = null;
                }
                // If connection fails, tell user the host might need to retry
                setError("Connection failed. Host needs to restart sharing.");
                setStatus('idle');
            }
        };

        const handleAnswer = async ({ from, answer }) => {
            const pc = peersRef.current.get(from);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (e) { }
            }
        };

        const handleIce = async ({ from, candidate }) => {
            const pc = memberPcRef.current;
            if (!pc) {
                memberIceQueueRef.current.push(candidate);
                return;
            }
            if (pc.remoteDescription) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) { }
            } else {
                memberIceQueueRef.current.push(candidate);
            }
        };

        const handleStopped = () => {
            if (memberPcRef.current) {
                memberPcRef.current.close();
                memberPcRef.current = null;
            }
            if (videoRef.current) videoRef.current.srcObject = null;
            setStatus('stopped');
            onClearMedia?.();
        };

        const handleStarted = () => {
            setStatus('waiting');
            setError(null);
            socket.emit('screen_share_ready', { roomCode });
        };

        socket.on('screen_share_started', handleStarted);
        socket.on('screen_share_offer', handleOffer);
        socket.on('screen_share_answer', handleAnswer);
        socket.on('screen_share_ice', handleIce);
        socket.on('screen_share_stopped', handleStopped);

        return () => {
            socket.off('screen_share_started', handleStarted);
            socket.off('screen_share_offer', handleOffer);
            socket.off('screen_share_answer', handleAnswer);
            socket.off('screen_share_ice', handleIce);
            socket.off('screen_share_stopped', handleStopped);
            if (memberPcRef.current) {
                memberPcRef.current.close();
                memberPcRef.current = null;
            }
        };
    }, [isHost, roomCode, onClearMedia]);

    // Host: handle answer and ICE
    const hostIceQueuesRef = useRef(new Map());

    useEffect(() => {
        if (!isHost) return;

        const flushIceQueue = async (memberId) => {
            const pc = peersRef.current.get(memberId);
            const queue = hostIceQueuesRef.current.get(memberId) || [];
            hostIceQueuesRef.current.set(memberId, []);
            for (const cand of queue) {
                if (pc) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(cand));
                    } catch (e) { }
                }
            }
        };

        const handleAnswer = async ({ from, answer }) => {
            const pc = peersRef.current.get(from);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                    await flushIceQueue(from);
                } catch (e) { }
            }
        };

        const handleIce = async ({ from, candidate }) => {
            const pc = peersRef.current.get(from);
            if (!pc) return;
            if (pc.remoteDescription) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) { }
            } else {
                const queue = hostIceQueuesRef.current.get(from) || [];
                queue.push(candidate);
                hostIceQueuesRef.current.set(from, queue);
            }
        };

        socket.on('screen_share_answer', handleAnswer);
        socket.on('screen_share_ice', handleIce);

        return () => {
            socket.off('screen_share_answer', handleAnswer);
            socket.off('screen_share_ice', handleIce);
        };
    }, [isHost]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // CRITICAL: Don't call stopSharing() here - it clears media on every re-render!
            // Only cleanup connections when component truly unmounts
            const stream = streamRef.current;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            peersRef.current.forEach(pc => pc.close());
            peersRef.current.clear();
        };
    }, []);

    if (error) {
        return (
            <div className="shared-view-container shared-view-error">
                <p>{error}</p>
                <button type="button" className="change-media-btn" onClick={onClearMedia}>Back to Media Selection</button>
            </div>
        );
    }

    return (
        <div className="shared-view-container">
            {isHost && (
                <div className="host-controls-overlay">
                    {status === 'sharing' ? (
                        <button type="button" className="shared-view-stop-btn" onClick={stopSharing} title="Stop Sharing">
                            <RefreshCw size={18} />
                            <span>Stop Sharing</span>
                        </button>
                    ) : (
                        <div className="start-share-prompt">
                            <h3>Ready to Share</h3>
                            <button type="button" className="start-share-btn" onClick={startCapture}>
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
                    className="shared-view-video"
                    style={{ objectFit: 'contain', backgroundColor: '#000' }}
                />
            </div>

            {status === 'capturing' && (
                <div className="shared-view-status">Select a BROWSER TAB and enable "Share tab audio" for best quality</div>
            )}
            {status === 'waiting' && !isHost && (
                <div className="shared-view-status">Waiting for host to start sharing...</div>
            )}
            {status === 'connecting' && !isHost && (
                <div className="shared-view-status">Connecting to live stream...</div>
            )}
            {status === 'stopped' && !isHost && (
                <div className="shared-view-status">Host stopped sharing.</div>
            )}
        </div>
    );
});

// ==========================================
// CONTAINER COMPONENT
// ==========================================
// Connects to Context, passes stable data to View.
export default function SharedViewPlayer({ media, isHost, onClearMedia }) {
    const { room, participants } = useRoom();

    // We pass participants to the View, but remember:
    // The View uses a ref for participants to avoid re-rendering loops for WebRTC logic.
    // However, if participants change (join/leave), the View *will* re-render because props changed.
    // This is correct behavior because we want to update the ref.
    // 
    // BUT! If `chat` changes, `SharedViewPlayer` re-renders.
    // `participants` ref in `RoomContext` might be stable or new array?
    // In `RoomContext`, `setParticipants` creates new array.
    // If only `chat` changes, `participants` array reference should be SAME as previous render.
    // So `SharedViewPlayerView` will NOT re-render.

    return (
        <SharedViewPlayerView
            isHost={isHost}
            roomCode={room?.code}
            hostId={room?.hostId}
            activeParticipants={participants}
            onClearMedia={onClearMedia}
        />
    );
}
