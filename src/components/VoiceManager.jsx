import React, { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../lib/socket';
import { sfuVoiceClient } from '../lib/sfuVoiceClient';
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

    // Phase 6: VAD (Voice Activity Detection) State
    const vadHangoverRef = useRef(0);
    const VAD_THRESHOLD = 25;
    const VAD_HANGOVER_TIME = 1500; // 1.5s of silence before cutting off

    // Ensure AudioContext is active (Browser Autoplay Policy Check)
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
            consumersRef.current.set(producerId, consumer);

            const stream = new MediaStream([consumer.track]);

            // Phase 3/7: Clean individual audio handles
            const audio = document.createElement('audio');
            audio.id = `audio-p-${producerId}`;
            audio.srcObject = stream;
            audio.autoplay = true;
            audio.playsInline = true;

            const producerUserId = consumer.appData?.userId;
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
    }, [isDeafened, userVolumes, removeAudio]);

    const resumeAudioContext = useCallback(async () => {
        try {
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
                console.log("[VoiceManager] 🔊 AudioContext Resumed by interaction");
            }
        } catch (e) {
            console.error("[VoiceManager] Failed to resume AudioContext:", e);
        }
    }, []);

    const fetchProducers = useCallback(() => {
        console.log("[VoiceManager] Requesting existing producers...");
        socket.emit('get_producers', { roomCode: room?.code, type: 'voice' }, (producers) => {
            if (Array.isArray(producers)) {
                console.log(`[VoiceManager] Fetched ${producers.length} voice producers`);
                producers.forEach(p => consumeProducer(p.producerId));
            }
        });
    }, [room?.code, consumeProducer]);

    // Phase 3 & 4 & 5 & 6 Integration
    const joinVoiceChannel = useCallback(async () => {
        if (!room || !currentUser) return;
        if (isJoined) return;

        let cancelled = false;

        try {
            info("Connecting to pro-audio...");

            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
            }

            // Phase 1: High-Fidelity Audio Constraints
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: { ideal: 1 },
                    sampleRate: { ideal: 48000 },
                    sampleSize: { ideal: 16 },
                    echoCancellation: { ideal: isEchoOn },
                    noiseSuppression: { ideal: isNoiseOn },
                    autoGainControl: { ideal: true },
                    latency: { ideal: 0.01 },
                    // Phase 4: Google Chrome Advanced Suppression Enforcements
                    googEchoCancellation: { ideal: isEchoOn },
                    googNoiseSuppression: { ideal: isNoiseOn },
                    googHighpassFilter: { ideal: true }
                },
                video: false
            });

            if (cancelled) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }

            const audioTrack = stream.getAudioTracks()[0];

            // Log verification for Phase 1
            console.log("[VoiceManager] 🚀 Audio Pipeline Verified:", {
                settings: audioTrack.getSettings(),
                constraints: audioTrack.getConstraints()
            });

            if (!audioTrack || audioTrack.readyState !== 'live') {
                throw new Error("Hardware failed: Track not live");
            }

            localStreamRef.current = stream;
            audioTrack.enabled = !isMuted;

            if (!socket.connected) {
                throw new Error("Socket disconnected. Please wait for reconnection.");
            }

            console.log("[VoiceManager] 🌐 Connecting to MediaSoup SFU...");
            await sfuVoiceClient.init(room.code, currentUser.oderId);
            if (cancelled) return;

            // Phase 7: Opus, Mono, DTX enforced at Client Level
            const { producerId } = await sfuVoiceClient.joinVoice({
                noiseSuppression: isNoiseOn,
                echoCancellation: isEchoOn
            });

            if (cancelled) return;

            console.log("[VoiceManager] ✅ Connected with Producer:", producerId);

            setupProcessing(stream);
            setIsJoined(true);
            showSuccess("Pro-Voice Active");
        } catch (err) {
            if (cancelled) return;
            console.error("[VoiceManager] ❌ Voice Join Failed:", err);
            showError("Voice Connection Failed: " + (err.message || err));
            setIsJoined(false);
            setVoiceTrigger(null);
        }

        return () => {
            cancelled = true;
        };
    }, [room, currentUser, isJoined, info, showSuccess, showError, setVoiceTrigger, isNoiseOn, isEchoOn, isMuted]);

    const leaveVoiceChannel = useCallback(async () => {
        if (!isJoined) return;

        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (analyserRef.current) analyserRef.current.disconnect();

        await sfuVoiceClient.leaveVoice();

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        audioElementsRef.current.forEach(audio => {
            audio.pause();
            audio.srcObject = null;
            if (audio.parentNode) audio.parentNode.removeChild(audio);
        });
        audioElementsRef.current.clear();
        consumersRef.current.clear();

        setIsJoined(false);
        info("Left Voice Room");
    }, [isJoined, info]);

    const setupProcessing = (stream) => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const audioContext = audioContextRef.current;
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.4;
            source.connect(analyser);
            analyserRef.current = analyser;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            let lastBroadcast = 0;
            const checkActivity = () => {
                if (!analyserRef.current || !isJoined) return;

                analyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const average = sum / bufferLength;

                // Detection threshold logic
                const isMicHardwareOn = !isMuted;
                const aboveThreshold = average > VAD_THRESHOLD;

                // Update local volume for UI meter
                setLocalVolume(isMicHardwareOn ? Math.min(100, Math.round(average * 2)) : 0);
                // Phase 6: Noise Gate Logic with Hangover
                if (aboveThreshold) {
                    vadHangoverRef.current = Date.now() + VAD_HANGOVER_TIME;
                }

                const isActive = isMicHardwareOn && (aboveThreshold || Date.now() < vadHangoverRef.current);

                // Notify server for visual UI indicator
                const now = Date.now();
                if (aboveThreshold !== lastSpeakingStatusRef.current && (now - lastBroadcast > 300)) {
                    lastSpeakingStatusRef.current = aboveThreshold;
                    lastBroadcast = now;
                    socket.emit('speaking-status', {
                        roomCode: room.code,
                        userId: currentUser.oderId,
                        isSpeaking: aboveThreshold
                    });
                }

                animationFrameRef.current = requestAnimationFrame(checkActivity);
            };

            checkActivity();
        } catch (err) {
            console.warn("[VoiceManager] VAD processing failed:", err);
        }
    };


    // EFFECTS

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
                    setupProcessing(sfuVoiceClient.audioStream);
                    localStreamRef.current = sfuVoiceClient.audioStream;
                }
                fetchProducers();
            }
        }
    }, [room, currentUser, voiceParticipants, isJoined, setupProcessing]);

    // Phase 5: REAL Track Recreation on Toggle
    useEffect(() => {
        if (!isJoined || !localStreamRef.current) return;

        const syncConstraints = async () => {
            try {
                console.log("[VoiceManager] ⚙️ Phase 5: Re-capturing hardware with new constraints...");
                const newStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: { ideal: isEchoOn },
                        noiseSuppression: { ideal: isNoiseOn },
                        autoGainControl: { ideal: true },
                        channelCount: { ideal: 1 },
                        sampleRate: { ideal: 48000 },
                        sampleSize: { ideal: 16 },
                        latency: { ideal: 0.01 },
                        // Advanced legacy Chrome enforcements
                        googEchoCancellation: { ideal: isEchoOn },
                        googEchoCancellation2: { ideal: isEchoOn },
                        googDAEchoCancellation: { ideal: isEchoOn },
                        googNoiseSuppression: { ideal: isNoiseOn },
                        googHighpassFilter: { ideal: true }
                    }
                });

                const newTrack = newStream.getAudioTracks()[0];
                newTrack.enabled = !isMuted;

                console.log("[VoiceManager] 🔄 Phase 5: replaceTrack() in SFU pipeline...");
                await sfuVoiceClient.replaceAudioTrack(newTrack);

                localStreamRef.current.getTracks().forEach(t => t.stop());
                localStreamRef.current = newStream;

                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                if (analyserRef.current) analyserRef.current.disconnect();
                setupProcessing(newStream);

                console.log("[VoiceManager] ✅ Audio constraints applied and verified.");
            } catch (err) {
                console.error("[VoiceManager] Sync Error:", err);
                warning("Low-quality fallback: Mic recapture failed.");
            }
        };

        syncConstraints();
    }, [isNoiseOn, isEchoOn]);

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

    // Command Context Hook
    useEffect(() => {
        if (!voiceTrigger) return;
        if (voiceTrigger === 'join') joinVoiceChannel();
        else if (voiceTrigger === 'leave') leaveVoiceChannel();
        setVoiceTrigger(null);
    }, [voiceTrigger, joinVoiceChannel, leaveVoiceChannel, setVoiceTrigger]);

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
            if (!room) return;
            console.log("[VoiceManager] Socket reconnected, re-syncing voice SFU...");
            try {
                await sfuVoiceClient.terminate();
                await sfuVoiceClient.init(room.code, currentUser?.oderId);

                if (localStreamRef.current) {
                    const track = localStreamRef.current.getAudioTracks()[0];
                    if (track) await sfuVoiceClient.joinVoice(track);
                }

                socket.emit('get_producers', { roomCode: room.code, type: 'voice' }, (producers) => {
                    if (Array.isArray(producers)) {
                        producers.forEach(p => consumeProducer(p.producerId));
                    }
                });
            } catch (e) {
                console.error("[VoiceManager] Voice recovery failed:", e);
            }
        };

        socket.on('voice-new-producer', onNewProducer);
        socket.on('voice_users_update', onUsers);
        socket.on('user-speaking-update', onSpeaking);
        socket.on('connect', onReconnect);

        socket.emit('get_producers', { roomCode: room.code, type: 'voice' }, (producers) => {
            if (Array.isArray(producers)) {
                producers.forEach(p => consumeProducer(p.producerId));
            }
        });

        const winHandle = () => resumeAudioContext();
        window.addEventListener('click', winHandle, { once: true });

        return () => {
            socket.off('voice-new-producer', onNewProducer);
            socket.off('voice_users_update', onUsers);
            socket.off('user-speaking-update', onSpeaking);
            socket.off('connect', onReconnect);
            window.removeEventListener('click', winHandle);
        };
    }, [room, consumeProducer, setVoiceParticipants, resumeAudioContext]);

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
