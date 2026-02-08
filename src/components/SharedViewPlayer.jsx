import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { socket } from '../lib/socket';
import './SharedViewPlayer.css';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const RTC_CONFIG = { iceServers: ICE_SERVERS };

export default function SharedViewPlayer({ media, isHost, onClearMedia }) {
    const { room, participants } = useRoom();
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const peersRef = useRef(new Map());
    const memberPcRef = useRef(null);
    const memberIceQueueRef = useRef([]);
    const [status, setStatus] = useState(isHost ? 'idle' : 'waiting');
    const [error, setError] = useState(null);

    const roomCode = room?.code;

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
        if (peersRef.current.has(memberSocketId)) return;

        const pc = new RTCPeerConnection(RTC_CONFIG);
        peersRef.current.set(memberSocketId, pc);

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                pc.close();
                peersRef.current.delete(memberSocketId);
            }
        };

        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('screen_share_ice', { to: memberSocketId, candidate: e.candidate });
            }
        };

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('screen_share_offer', { to: memberSocketId, offer });
        } catch (err) {
            pc.close();
            peersRef.current.delete(memberSocketId);
        }
    }, [roomCode]);

    // Host: capture stream
    useEffect(() => {
        if (!isHost || !roomCode) return;

        const startCapture = async () => {
            try {
                setStatus('capturing');
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
                streamRef.current = stream;

                stream.getVideoTracks()[0]?.addEventListener('ended', () => {
                    stopSharing();
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }

                socket.emit('screen_share_start', {
                    roomCode,
                    userId: room.hostId
                });

                setStatus('sharing');
            } catch (err) {
                setError(err.message || 'Failed to share screen');
                setStatus('idle');
                onClearMedia?.();
            }
        };

        startCapture();
        return () => {};
    }, [isHost, roomCode, room?.hostId, stopSharing, onClearMedia]);

    // Host: handle member ready - create offer when they request
    useEffect(() => {
        if (!isHost || !roomCode) return;

        const onRequestOffer = ({ memberSocketId }) => {
            if (streamRef.current && status === 'sharing') {
                createOfferForMember(memberSocketId);
            }
        };

        socket.on('screen_share_request_offer', onRequestOffer);
        return () => socket.off('screen_share_request_offer', onRequestOffer);
    }, [isHost, roomCode, status, createOfferForMember]);

    // Host: create offers for current participants (backup for members already in room)
    useEffect(() => {
        if (!isHost || status !== 'sharing' || !streamRef.current) return;

        const mySocketId = socket.id;
        participants.forEach(p => {
            if (p.id && p.id !== mySocketId && !peersRef.current.has(p.id)) {
                createOfferForMember(p.id);
            }
        });
    }, [isHost, status, participants, createOfferForMember]);

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
                } catch (e) {}
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
                await pc.setLocalDescription(answer);
                socket.emit('screen_share_answer', { to: from, answer });
            } catch (err) {
                pc.close();
                memberPcRef.current = null;
                setStatus('waiting');
            }
        };

        const handleAnswer = async ({ from, answer }) => {
            const pc = peersRef.current.get(from);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (e) {}
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
                } catch (e) {}
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
                    } catch (e) {}
                }
            }
        };

        const handleAnswer = async ({ from, answer }) => {
            const pc = peersRef.current.get(from);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                    await flushIceQueue(from);
                } catch (e) {}
            }
        };

        const handleIce = async ({ from, candidate }) => {
            const pc = peersRef.current.get(from);
            if (!pc) return;
            if (pc.remoteDescription) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {}
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
            if (isHost) stopSharing();
        };
    }, [isHost, stopSharing]);

    if (error) {
        return (
            <div className="shared-view-container shared-view-error">
                <p>{error}</p>
                <button className="change-media-btn" onClick={onClearMedia}>Back to Media Selection</button>
            </div>
        );
    }

    return (
        <div className="shared-view-container">
            {isHost && (
                <button className="shared-view-stop-btn" onClick={stopSharing} title="Stop Sharing">
                    <RefreshCw size={18} />
                    <span>Stop Sharing</span>
                </button>
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
                <div className="shared-view-status">Select browser tab and enable &quot;Share tab audio&quot;</div>
            )}
            {status === 'waiting' && !isHost && (
                <div className="shared-view-status">Waiting for host to start sharing...</div>
            )}
            {status === 'connecting' && !isHost && (
                <div className="shared-view-status">Connecting...</div>
            )}
            {status === 'stopped' && !isHost && (
                <div className="shared-view-status">Host stopped sharing.</div>
            )}
        </div>
    );
}
