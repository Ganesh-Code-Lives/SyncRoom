import React, { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../lib/socket';
import { sfuVoiceClient } from '../lib/sfuVoiceClient';
import { useRoom } from '../context/RoomContext';
import { useVoice } from '../context/VoiceContext';
import { useToast } from '../context/ToastContext';
import { RNNoiseNode } from '../lib/audio/RNNoiseNode';

const VoiceManager = () => {
    const { room, currentUser } = useRoom();
    const {
        voiceParticipants,
        setVoiceParticipants,
        voiceTrigger,
        setVoiceTrigger,
        isDeafened,
        isMuted,
        isNoiseOn,
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
    const rnnoiseNodeRef = useRef(null);
    const processorDestinationRef = useRef(null);
    const rawStreamRef = useRef(null);

    const VAD_THRESHOLD = 25;
    const VAD_HANGOVER_TIME = 1500; // 1.5s of silence before cutting off
    const vadHangoverRef = useRef(0);

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
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.5; // Smoother visuals
            source.connect(analyser);
            analyserRef.current = analyser;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            // Start Animation Loop
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

            let lastBroadcast = 0;
            const checkActivity = () => {
                if (!analyserRef.current || !isJoined) return;

                analyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const average = sum / bufferLength;

                // Thresholds
                const isMicHardwareOn = !isMuted;
                const aboveThreshold = average > VAD_THRESHOLD;

                // UI Volume
                setLocalVolume(isMicHardwareOn ? Math.min(100, Math.round(average * 2.5)) : 0);

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

                // 1. Acquire Mic (Clean)
                let stream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: isEchoOn,  // Use user's echo setting
                            noiseSuppression: false,     // We want raw for RNNoise
                            autoGainControl: false,
                            channelCount: 1,
                            sampleRate: 48000
                        },
                        video: false
                    });
                    console.log(`[VoiceManager] 🎤 Initial mic with echoCancellation=${isEchoOn}`);
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

                // 3. Prepare Pipeline
                let finalTrack = micTrack;

                if (isNoiseOn) {
                    try {
                        const ctx = await getOrInitContext();

                        // Create RNNoise if missing
                        if (!rnnoiseNodeRef.current) {
                            const rnnoise = new RNNoiseNode(ctx);
                            await rnnoise.init();
                            rnnoiseNodeRef.current = rnnoise;
                            processorDestinationRef.current = ctx.createMediaStreamDestination();
                        }

                        // Connect Graph: Source -> RNNoise -> Destination
                        const source = ctx.createMediaStreamSource(stream);
                        source.connect(rnnoiseNodeRef.current.processor);
                        rnnoiseNodeRef.current.processor.connect(processorDestinationRef.current);

                        const procTrack = processorDestinationRef.current.stream.getAudioTracks()[0];
                        if (procTrack && procTrack.readyState === 'live') {
                            finalTrack = procTrack;
                            console.log("[VoiceManager] 🔉 RNNoise Pipeline Active");
                        }
                    } catch (e) {
                        console.error("RNNoise Init Failed:", e);
                        // Fallback automatically to raw 'finalTrack'
                    }
                }

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

    }, [voiceTrigger, isJoined, room, currentUser, socket, getOrInitContext, setupVAD, isNoiseOn, isMuted, info, showError, showSuccess]);

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

    // RNNoise / Feature Toggle Logic
    const prevNoiseOnRef = useRef(isNoiseOn);
    const prevEchoOnRef = useRef(isEchoOn);

    useEffect(() => {
        // Only run logic if isNoiseOn OR isEchoOn actually CHANGED while we are joined.
        const noiseChanged = prevNoiseOnRef.current !== isNoiseOn;
        const echoChanged = prevEchoOnRef.current !== isEchoOn;

        prevNoiseOnRef.current = isNoiseOn;
        prevEchoOnRef.current = isEchoOn;

        if (!isJoined || (!noiseChanged && !echoChanged)) return;
        if (processingRef.current) return; // Lock

        const togglePipeline = async () => {
            processingRef.current = true;
            console.log(`[VoiceManager] 🔄 Refreshing Pipeline (Noise: ${isNoiseOn}, Echo: ${isEchoOn})`);

            let newStream = null;
            let oldStream = localStreamRef.current;

            try {
                // 1. Acquire NEW Source with proper echo cancellation setting
                try {
                    newStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: isEchoOn,  // Apply echo setting
                            noiseSuppression: false,     // We control this with RNNoise
                            autoGainControl: false,
                            channelCount: 1,
                            sampleRate: 48000
                        }
                    });
                    console.log(`[VoiceManager] 🎤 Acquired mic with echoCancellation=${isEchoOn}`);
                } catch (e) {
                    console.warn("Strict toggle capture failed", e);
                    newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                }

                const newTrack = newStream.getAudioTracks()[0];
                newTrack.enabled = !isMuted; // Sync mute state

                let targetTrack = newTrack;

                // 2. Process if needed
                console.log(`[VoiceManager] 🔍 isNoiseOn = ${isNoiseOn}`);
                if (isNoiseOn) {
                    console.log("[VoiceManager] 🎯 Entering RNNoise Processing Block");
                    try {
                        const ctx = await getOrInitContext();
                        console.log("[VoiceManager] ✓ AudioContext ready:", ctx.state);

                        if (!rnnoiseNodeRef.current) {
                            console.log("[VoiceManager] 🔧 Initializing NEW RNNoise instance...");
                            const rnnoise = new RNNoiseNode(ctx);
                            await rnnoise.init();
                            rnnoiseNodeRef.current = rnnoise;
                            console.log("[VoiceManager] ✅ RNNoise initialized successfully");
                        } else {
                            console.log("[VoiceManager] ♻️ Reusing existing RNNoise instance");
                        }

                        // CRITICAL FIX: Create a FRESH destination every time to prevent "ended" track bug
                        console.log("[VoiceManager] 🆕 Creating fresh MediaStreamDestination...");
                        processorDestinationRef.current = ctx.createMediaStreamDestination();

                        // Connect New Source -> RNNoise -> Fresh Destination
                        console.log("[VoiceManager] 🔗 Connecting audio graph...");
                        const source = ctx.createMediaStreamSource(newStream);
                        source.connect(rnnoiseNodeRef.current.processor);
                        rnnoiseNodeRef.current.processor.connect(processorDestinationRef.current);

                        const procTrack = processorDestinationRef.current.stream.getAudioTracks()[0];
                        console.log(`[VoiceManager] 📡 Processed track state: ${procTrack?.readyState}`);
                        if (procTrack && procTrack.readyState === 'live') {
                            targetTrack = procTrack;
                            console.log("[VoiceManager] ✅ Using RNNoise processed track:", procTrack.id);
                        } else {
                            console.warn("[VoiceManager] ⚠️ Processed track invalid, using raw");
                        }
                    } catch (e) {
                        console.error("[VoiceManager] ❌ RNNoise Failed:", e);
                        showError("Noise Suppression Failed - Using Standard");
                    }
                } else {
                    console.log("[VoiceManager] 🎤 Using RAW microphone (No Processing)");
                }

                // 3. Replace Track in SFU
                await sfuVoiceClient.replaceAudioTrack(targetTrack);

                // 4. Update Refs & VAD
                localStreamRef.current = newStream;
                setupVAD(newStream); // Visualize new valid source

                // 5. Stop Old Stream (Delay slightly to ensure handover?)
                // Actually standard practice is stop immediately after replace confirms.
                if (oldStream && oldStream.id !== newStream.id) {
                    oldStream.getTracks().forEach(t => t.stop());
                }

                showSuccess(isNoiseOn ? "Noise Suppression Enabled" : "Noise Suppression Disabled");

            } catch (err) {
                console.error("Toggle Failed:", err);
                showError("Toggle Failed");
                // Cleanup new if failed
                if (newStream) newStream.getTracks().forEach(t => t.stop());
            } finally {
                processingRef.current = false;
            }
        };

        togglePipeline();
    }, [isNoiseOn, isEchoOn, isJoined, getOrInitContext, setupVAD, isMuted, showError, showSuccess]);

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

    // Cleanup on Leave
    const leaveVoiceChannel = useCallback(async () => {
        if (!isJoined) return;

        // Stop SFU
        await sfuVoiceClient.leaveVoice();

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

        // Destroy RNNoise? Or keep for session? 
        // Better to keep context alive but suspend if huge resource?
        // Let's destroy node but keep context.
        if (rnnoiseNodeRef.current) {
            rnnoiseNodeRef.current.destroy();
            rnnoiseNodeRef.current = null;
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
