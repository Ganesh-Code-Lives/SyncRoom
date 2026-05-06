import React, { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../lib/socket';
import { sfuVoiceClient } from '../lib/sfuVoiceClient';
import { sfuClient } from '../lib/sfuClient';
import { useRoom } from '../context/RoomContext';
import { useVoice } from '../context/VoiceContext';
import { useToast } from '../context/ToastContext';

const VoiceManager = () => {
    const { room, currentUser } = useRoom();
    const {
        voiceParticipants,
        setVoiceParticipants,
        voiceTrigger,
        setVoiceTrigger,
        isDeafened,
        isMuted,
        isEchoOn,
        userVolumes,
        setLocalVolume
    } = useVoice();
    const { info, error: showError, success: showSuccess, warning } = useToast();
    const [isJoined, setIsJoined] = useState(false);

    const audioPoolRef = useRef(null);
    const audioElementsRef = useRef(new Map()); // producerId -> audio element
    const consumersRef = useRef(new Map()); // producerId -> consumer
    const analyserRef = useRef(null);
    const audioContextRef = useRef(null);
    const animationFrameRef = useRef(null);
    const lastSpeakingStatusRef = useRef(false);
    const localStreamRef = useRef(null);
    const connectingRef = useRef(false); // Prevent double-clicks
    const processingRef = useRef(false); // Global processing lock for toggles
    const rawStreamRef = useRef(null);
    const statsIntervalRef = useRef(null);
    const videoClampStateRef = useRef({
        applied: false,
        original: new Map() // senderTrackId -> [{ maxBitrate, priority, networkPriority, scaleResolutionDownBy }]
    });

    const VAD_THRESHOLD = 25;
    const VAD_HANGOVER_TIME = 1500; // 1.5s of silence before cutting off
    const vadHangoverRef = useRef(0);
    const vadSmoothedRef = useRef(0);
    const vadNoiseFloorRef = useRef(0.01);

    // Audio Cleanup Handler
    const removeAudio = useCallback((producerId) => {
        const audio = audioElementsRef.current.get(producerId);
        if (audio) {
            audio.pause();
            audio.srcObject = null;
            if (audio.parentNode) audio.parentNode.removeChild(audio);
            audioElementsRef.current.delete(producerId);
        }
        consumersRef.current.delete(producerId);
    }, []);

    const consumeProducer = useCallback(async (producerId) => {
        if (consumersRef.current.has(producerId)) return;

        try {
            console.log(`[VoiceManager] 🔊 Consuming Remote [${producerId}]`);
            const consumer = await sfuVoiceClient.consume(producerId);

            // Prevent Echo & Feedback (Internal Check)
            const producerUserId = consumer.appData?.userId;
            if (producerUserId === currentUser?.oderId) {
                console.warn("[VoiceManager] 🛡️ Prevented consuming own audio stream");
                consumer.close();
                return;
            }

            consumersRef.current.set(producerId, consumer);

            const stream = new MediaStream([consumer.track]);

            // Create Audio Element
            const audio = document.createElement('audio');
            audio.id = `audio-p-${producerId}`;
            audio.srcObject = stream;
            audio.autoplay = true;
            audio.playsInline = true;

            if (producerUserId) {
                audio.volume = userVolumes[producerUserId] ?? 1.0;
            }

            audio.muted = isDeafened;

            if (audioPoolRef.current) {
                audioPoolRef.current.appendChild(audio);
            }

            audioElementsRef.current.set(producerId, audio);

            // Force play handle
            audio.play().catch(e => {
                console.warn("[VoiceManager] Autoplay blocked peer stream.");
            });

            consumer.on('transportclose', () => removeAudio(producerId));
            consumer.on('producerclose', () => removeAudio(producerId));
        } catch (err) {
            console.error(`[VoiceManager] Fail Consume ${producerId}:`, err);
        }
    }, [isDeafened, userVolumes, removeAudio, currentUser?.oderId]);

    // Helper: Unified Audio Context Management
    const getOrInitContext = useCallback(async () => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            console.log("[VoiceManager] 🔊 Initializing AudioContext...");
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 48000,
                latencyHint: 'interactive'
            });
        }
        if (audioContextRef.current.state === 'suspended') {
            console.log("[VoiceManager] ▶️ Resuming AudioContext...");
            await audioContextRef.current.resume();
        }
        return audioContextRef.current;
    }, []);

    // Helper: Setup VAD (Visualizer) on a specific stream
    const setupVAD = useCallback(async (stream) => {
        try {
            const ctx = await getOrInitContext();

            // Cleanup old analyser if exists
            if (analyserRef.current) {
                // We don't close the context, just disconnect the node
                try { analyserRef.current.disconnect(); } catch (e) { }
            }

            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.2;
            source.connect(analyser);
            analyserRef.current = analyser;

            const bufferLength = analyser.fftSize;
            const dataArray = new Float32Array(bufferLength);

            // Start Animation Loop
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

            let lastBroadcast = 0;
            const checkActivity = () => {
                if (!analyserRef.current || !isJoined) return;

                analyserRef.current.getFloatTimeDomainData(dataArray);
                let sumSq = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i];
                    sumSq += v * v;
                }
                const rms = Math.sqrt(sumSq / bufferLength);

                // Adaptive noise floor (slow)
                const nf = vadNoiseFloorRef.current || 0.01;
                vadNoiseFloorRef.current = Math.max(0.001, Math.min(nf * 0.995 + rms * 0.005, 0.05));

                // Smooth VAD level (fast)
                const prev = vadSmoothedRef.current || 0;
                const smooth = prev * 0.85 + rms * 0.15;
                vadSmoothedRef.current = smooth;

                // Thresholds
                const isMicHardwareOn = !isMuted;
                const trigger = Math.max(vadNoiseFloorRef.current * 4.0, 0.02);
                const aboveThreshold = smooth > trigger;

                // UI Volume
                setLocalVolume(isMicHardwareOn ? Math.min(100, Math.round(smooth * 220)) : 0);

                // Hangover Logic
                if (aboveThreshold) {
                    vadHangoverRef.current = Date.now() + VAD_HANGOVER_TIME;
                }

                const isActive = isMicHardwareOn && (aboveThreshold || Date.now() < vadHangoverRef.current);

                // Server Broadcast (Throttled 300ms)
                const now = Date.now();
                if (isActive !== lastSpeakingStatusRef.current && (now - lastBroadcast > 300)) {
                    lastSpeakingStatusRef.current = isActive;
                    lastBroadcast = now;
                    socket.emit('speaking-status', {
                        roomCode: room.code,
                        userId: currentUser.oderId,
                        isSpeaking: isActive
                    });
                }
                animationFrameRef.current = requestAnimationFrame(checkActivity);
            };
            checkActivity();
        } catch (err) {
            console.error("[VoiceManager] VAD Setup Failed:", err);
        }
    }, [isJoined, isMuted, setLocalVolume, room, currentUser, getOrInitContext]);

    const fetchProducers = useCallback(() => {
        console.log("[VoiceManager] Requesting existing producers...");
        socket.emit('get_producers', { roomCode: room?.code, type: 'voice' }, (producers) => {
            if (Array.isArray(producers)) {
                console.log(`[VoiceManager] Fetched ${producers.length} voice producers`);
                producers.forEach(p => consumeProducer(p.producerId));
            }
        });
    }, [room?.code, consumeProducer]);

    // Unified Join Voice Logic (Triggered by voiceTrigger state)
    useEffect(() => {
        if (voiceTrigger !== 'join' || isJoined || connectingRef.current || !room || !currentUser) return;

        const connectVoice = async () => {
            connectingRef.current = true;
            let cancelled = false;

            // Timeout Protection (10s)
            const connectionTimeout = setTimeout(() => {
                if (cancelled) return;
                console.error("[VoiceManager] ⚠️ Connection timed out");
                cancelled = true;
                connectingRef.current = false;
                showError("Connection timed out");
                setIsJoined(false);
                setVoiceTrigger(null);
                if (localStreamRef.current) {
                    localStreamRef.current.getTracks().forEach(t => t.stop());
                    localStreamRef.current = null;
                }
            }, 10000);

            try {
                if (!socket.connected) throw new Error("Socket disconnected");

                info("Connecting voice...");

                // 1. Acquire Mic (Production defaults: browser AEC/NS/AGC)
                let stream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                            channelCount: 1,
                            sampleRate: 48000,
                            sampleSize: 16
                        },
                        video: false
                    });
                    console.log(`[VoiceManager] 🎤 Mic acquired (AEC/NS/AGC enabled)`);
                } catch (e) {
                    console.warn("Strict mic failed, using fallback");
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                }

                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

                // 2. Validate Mic
                const micTrack = stream.getAudioTracks()[0];
                if (!micTrack || micTrack.readyState !== 'live') throw new Error("Mic invalid");
                micTrack.enabled = !isMuted;

                localStreamRef.current = stream; // Store "current active stream"
                rawStreamRef.current = stream;   // Store "raw source"

                // 3. Pipeline: use the raw mic track directly.
                // Custom DSP (RNNoise ScriptProcessor) removed because it adds latency and glitches under UI load.
                const finalTrack = micTrack;

                if (cancelled) return;

                // 4. Join SFU
                await sfuVoiceClient.init(room.code, currentUser.oderId);
                const { producerId } = await sfuVoiceClient.joinVoice(finalTrack);

                if (cancelled) return;

                // 5. Success State
                console.log("[VoiceManager] ✅ Joined:", producerId);
                setupVAD(stream); // Visualize the RAW input usually, or processed? Raw is better for "Mic Check" feel
                setIsJoined(true);
                showSuccess("Voice Connected");

            } catch (err) {
                if (cancelled) return;
                console.error("Join Failed:", err);
                showError(`Voice Failed: ${err.message}`);
                setIsJoined(false);
                if (localStreamRef.current) {
                    localStreamRef.current.getTracks().forEach(t => t.stop());
                    localStreamRef.current = null;
                }
            } finally {
                clearTimeout(connectionTimeout);
                connectingRef.current = false;
                setVoiceTrigger(null);
            }
        };

        connectVoice();

    }, [voiceTrigger, isJoined, room, currentUser, socket, getOrInitContext, setupVAD, isMuted, info, showError, showSuccess]);

    // Mic State Sync
    useEffect(() => {
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (track) {
            track.enabled = !isMuted;
            console.log(`[VoiceManager] Mic Hardware -> ${!isMuted ? 'ACTIVE' : 'MUTED'}`);
        }
    }, [isMuted]);

    // Deafen State Sync
    useEffect(() => {
        audioElementsRef.current.forEach(audio => {
            audio.muted = isDeafened;
        });
        console.log(`[VoiceManager] Speaker Output -> ${!isDeafened ? 'ON' : 'OFF'}`);
    }, [isDeafened]);

    // Singleton State Sync for Re-renders
    useEffect(() => {
        // If singleton is already loaded and we are in the participants list, 
        // we should resume local processing of the existing stream.
        if (!isJoined && sfuVoiceClient.loaded && room && currentUser) {
            const amIInVoice = voiceParticipants.some(p => p.oderId === currentUser.oderId);
            if (amIInVoice) {
                console.log("[VoiceManager] Singleton active and user joined, syncing local state...");
                setIsJoined(true);
                if (sfuVoiceClient.audioStream) {
                    console.log("[VoiceManager] Resuming local VAD processing for existing stream");
                    setupVAD(sfuVoiceClient.audioStream);
                    localStreamRef.current = sfuVoiceClient.audioStream;
                }
                fetchProducers();
            }
        }
    }, [room, currentUser, voiceParticipants, isJoined, setupVAD, fetchProducers]);

    // NOTE: Echo/noise toggles no longer hot-swap the mic track.
    // This intentionally stabilizes voice latency and prevents glitchy mid-call DSP graph rebuilds.

    // Individual Volume Control
    useEffect(() => {
        consumersRef.current.forEach((consumer, producerId) => {
            const audio = audioElementsRef.current.get(producerId);
            if (audio) {
                const userId = consumer.appData?.userId;
                if (userId) {
                    audio.volume = userVolumes[userId] ?? 1.0;
                }
            }
        });
    }, [userVolumes]);

    // Voice telemetry + first-pass congestion protection (audio-first).
    useEffect(() => {
        if (!isJoined) return;

        const pc = sfuVoiceClient.sendTransport?._handler?._pc;
        if (!pc?.getStats) return;

        let lastSummaryAt = 0;
        let lastPacketsSent = 0;
        let lastPacketsLost = 0;

        const tick = async () => {
            try {
                const stats = await pc.getStats();
                let outboundAudio = null;
                let candidatePair = null;
                let transport = null;

                stats.forEach(report => {
                    if (report.type === 'outbound-rtp' && report.kind === 'audio') outboundAudio = report;
                    if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) candidatePair = report;
                    if (report.type === 'transport') transport = report;
                });

                // Derive a rough loss fraction using deltas (when available)
                let lossFrac = 0;
                if (outboundAudio?.packetsSent != null) {
                    const ps = outboundAudio.packetsSent;
                    const pl = outboundAudio.packetsLost || 0;
                    const dSent = ps - lastPacketsSent;
                    const dLost = pl - lastPacketsLost;
                    if (dSent > 0) lossFrac = Math.max(0, Math.min(1, dLost / dSent));
                    lastPacketsSent = ps;
                    lastPacketsLost = pl;
                }

                const rtt = candidatePair?.currentRoundTripTime != null ? candidatePair.currentRoundTripTime : null;
                const relay = candidatePair?.localCandidateType === 'relay' || candidatePair?.remoteCandidateType === 'relay';

                // Audio-first protection: if RTT/loss is bad, clamp audio bitrate down to stabilize.
                // (This is intentionally conservative; later we can do tiered control + video sacrifice.)
                const degraded = (rtt != null && rtt > 0.3) || lossFrac > 0.08 || relay;
                const targetMaxBitrate = degraded ? 32000 : 64000;

                try {
                    const sender = pc.getSenders?.().find(s => s.track && s.track.kind === 'audio');
                    if (sender?.getParameters && sender?.setParameters) {
                        const params = sender.getParameters();
                        if (params?.encodings?.length) {
                            const cur = params.encodings[0].maxBitrate;
                            if (cur == null || Math.abs(cur - targetMaxBitrate) > 1000) {
                                params.encodings[0] = { ...params.encodings[0], maxBitrate: targetMaxBitrate };
                                await sender.setParameters(params);
                            }
                        }
                    }
                } catch (e) {
                    // Ignore setParameters failures.
                }

                // Video sacrifice policy (screenshare/camera): when voice is degraded, clamp any active
                // video encoders on the media SFU transport aggressively. Restore when voice recovers.
                try {
                    const vpc = sfuClient.sendTransport?._handler?._pc;
                    if (vpc?.getSenders) {
                        const senders = vpc.getSenders().filter(s => s.track && s.track.kind === 'video');
                        if (degraded) {
                            if (!videoClampStateRef.current.applied) {
                                // Snapshot originals once (per sender track)
                                for (const s of senders) {
                                    const params = s.getParameters?.();
                                    if (params?.encodings?.length) {
                                        videoClampStateRef.current.original.set(
                                            s.track.id,
                                            params.encodings.map(e => ({
                                                maxBitrate: e.maxBitrate,
                                                priority: e.priority,
                                                networkPriority: e.networkPriority,
                                                scaleResolutionDownBy: e.scaleResolutionDownBy
                                            }))
                                        );
                                    }
                                }
                                videoClampStateRef.current.applied = true;
                                console.log('[VoicePolicy] Degraded voice detected -> clamping video encoders');
                            }

                            // Clamp: keep a tiny base layer to reduce encoder spikes.
                            for (const s of senders) {
                                if (!s.getParameters || !s.setParameters) continue;
                                const params = s.getParameters();
                                if (!params?.encodings?.length) continue;

                                params.encodings = params.encodings.map((e, idx) => {
                                    const target = idx === 0 ? 80000 : (idx === 1 ? 150000 : 250000);
                                    return {
                                        ...e,
                                        priority: 'low',
                                        networkPriority: 'low',
                                        maxBitrate: Math.min(e.maxBitrate || target, target)
                                    };
                                });
                                await s.setParameters(params);
                            }
                        } else if (videoClampStateRef.current.applied) {
                            // Restore originals
                            for (const s of senders) {
                                if (!s.getParameters || !s.setParameters) continue;
                                const orig = videoClampStateRef.current.original.get(s.track.id);
                                if (!orig) continue;
                                const params = s.getParameters();
                                if (!params?.encodings?.length) continue;
                                params.encodings = params.encodings.map((e, idx) => ({
                                    ...e,
                                    ...orig[idx]
                                }));
                                await s.setParameters(params);
                            }
                            videoClampStateRef.current.applied = false;
                            videoClampStateRef.current.original.clear();
                            console.log('[VoicePolicy] Voice recovered -> restored video encoder parameters');
                        }
                    }
                } catch (e) {
                    // Ignore policy failures (no active video transport, browser restrictions, etc.)
                }

                const now = Date.now();
                if (now - lastSummaryAt > 5000) {
                    lastSummaryAt = now;
                    console.log('[VoiceTelemetry]', {
                        rttMs: rtt != null ? Math.round(rtt * 1000) : null,
                        relay,
                        lossFrac: Number(lossFrac.toFixed(3)),
                        audioMaxBitrate: targetMaxBitrate,
                        bytesSent: outboundAudio?.bytesSent,
                        packetsSent: outboundAudio?.packetsSent,
                        packetsLost: outboundAudio?.packetsLost,
                        availableOutgoingBitrate: candidatePair?.availableOutgoingBitrate
                    });
                }
            } catch (e) {
                // Swallow stats errors.
            }
        };

        statsIntervalRef.current = setInterval(tick, 1000);
        tick();

        return () => {
            if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
        };
    }, [isJoined]);

    // Cleanup on Leave
    const leaveVoiceChannel = useCallback(async () => {
        if (!isJoined) return;

        // Stop SFU
        sfuVoiceClient.terminate();

        // Stop Tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        // Cleanup Audio Context / Nodes
        if (analyserRef.current) {
            analyserRef.current.disconnect();
            analyserRef.current = null;
        }

        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

        // Cleanup Audio Elements
        audioElementsRef.current.forEach(audio => {
            audio.pause();
            audio.srcObject = null;
            audio.remove();
        });
        audioElementsRef.current.clear();
        consumersRef.current.clear();

        setIsJoined(false);
        info("Disconnected");

    }, [isJoined, info]);

    // Handle Leave Trigger
    useEffect(() => {
        if (voiceTrigger === 'leave') {
            leaveVoiceChannel();
            setVoiceTrigger(null);
        }
    }, [voiceTrigger, leaveVoiceChannel, setVoiceTrigger]);

    // Global Socket & Interaction Listeners
    useEffect(() => {
        if (!room) return;

        const onNewProducer = ({ producerId }) => consumeProducer(producerId);
        const onSpeaking = ({ userId, isSpeaking }) => {
            setVoiceParticipants(prev => prev.map(u =>
                u.oderId === userId ? { ...u, isSpeaking } : u
            ));
        };
        const onUsers = (users) => setVoiceParticipants(users);

        const onReconnect = async () => {
            // simplified recovery
            if (isJoined && localStreamRef.current) {
                console.log("Reconnecting voice...");
                // Trigger a retoggle or re-join logic?
                // For now just ensure socket events are bound.
            }
        };

        socket.on('voice-new-producer', onNewProducer);
        socket.on('voice_users_update', onUsers);
        socket.on('user-speaking-update', onSpeaking);

        // Initial fetch
        socket.emit('get_producers', { roomCode: room.code, type: 'voice' }, (producers) => {
            if (Array.isArray(producers)) {
                producers.forEach(p => consumeProducer(p.producerId));
            }
        });

        // Removed window click listener as getOrInitContext handles resume
        // and is called on demand.

        return () => {
            socket.off('voice-new-producer', onNewProducer);
            socket.off('voice_users_update', onUsers);
            socket.off('user-speaking-update', onSpeaking);
            // socket.off('connect', onReconnect); // Removed as per instruction
        };
    }, [room, consumeProducer, setVoiceParticipants, isJoined]);

    // Verification Guard
    useEffect(() => {
        if (!isJoined) return;
        const interval = setInterval(() => {
            try {
                const sendTransport = sfuVoiceClient.sendTransport;
                if (sendTransport && sendTransport._handler && sendTransport._handler._pc) {
                    const pc = sendTransport._handler._pc;
                    const audioSenders = pc.getSenders().filter(s => s.track && s.track.kind === 'audio');

                    if (audioSenders.length > 1) {
                        console.error("[VoiceGuard] 🚨 CRITICAL: Duplicate audio senders detected!");
                        showError("Connection Warning: Duplicate Audio Detected");
                    }
                }
            } catch (e) {
                // Ignore access errors
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [isJoined, showError]);

    return (
        <div
            ref={audioPoolRef}
            id="voice-relay-node"
            style={{
                position: 'fixed',
                bottom: 0,
                right: 0,
                width: 0,
                height: 0,
                opacity: 0,
                pointerEvents: 'none',
                overflow: 'hidden'
            }}
        />
    );
};

export default VoiceManager;
