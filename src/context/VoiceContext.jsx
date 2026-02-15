import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { socket } from '../lib/socket';
import { useToast } from './ToastContext';
import { useRoom } from './RoomContext';

const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
    const { room, currentUser } = useRoom();
    const [voiceParticipants, setVoiceParticipants] = useState([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isNoiseOn, setIsNoiseOn] = useState(true);
    const [isEchoOn, setIsEchoOn] = useState(true);
    const [userVolumes, setUserVolumes] = useState({}); // userId -> volume (0-1)
    const [localVolume, setLocalVolume] = useState(0); // 0-100 for mic meter
    const [voiceTrigger, setVoiceTrigger] = useState(null); // 'join' | 'leave' | null
    const [isVoiceOpenMobile, setIsVoiceOpenMobile] = useState(false);

    const { info, success } = useToast();

    // Sync voice participants from room snapshot if available (initial load)
    useEffect(() => {
        if (room?.voiceUsers && voiceParticipants.length === 0) {
            console.log('[VoiceContext] Initializing from room snapshot:', room.voiceUsers.length);
            setVoiceParticipants(room.voiceUsers);
        }
    }, [room?.code, room?.voiceUsers]);

    // Socket Listeners
    useEffect(() => {
        const handleVoiceUsersUpdate = (users) => setVoiceParticipants(users);
        const handleVoiceMuteChanged = ({ userId, isMuted }) => {
            setVoiceParticipants(prev => prev.map(u => u.oderId === userId ? { ...u, isMuted } : u));
        };
        const handleVoiceDeafenChanged = ({ userId, isDeafened }) => {
            setVoiceParticipants(prev => prev.map(u => u.oderId === userId ? { ...u, isDeafened } : u));
        };
        const handleSpeakingUpdate = ({ userId, isSpeaking }) => {
            setVoiceParticipants(prev => prev.map(u => u.oderId === userId ? { ...u, isSpeaking } : u));
        };

        socket.on('voice_users_update', handleVoiceUsersUpdate);
        socket.on('voice_user_mute_changed', handleVoiceMuteChanged);
        socket.on('voice_user_deafen_changed', handleVoiceDeafenChanged);
        socket.on('user-speaking-update', handleSpeakingUpdate);

        return () => {
            socket.off('voice_users_update', handleVoiceUsersUpdate);
            socket.off('voice_user_mute_changed', handleVoiceMuteChanged);
            socket.off('voice_user_deafen_changed', handleVoiceDeafenChanged);
            socket.off('user-speaking-update', handleSpeakingUpdate);
        };
    }, []);

    const toggleVoice = useCallback(() => {
        const isJoined = voiceParticipants.some(p => p.oderId === currentUser?.oderId);
        setVoiceTrigger(isJoined ? 'leave' : 'join');
    }, [voiceParticipants, currentUser]);

    const toggleMute = useCallback(() => {
        if (!room || !currentUser) return;
        const userId = currentUser.oderId;
        setIsMuted(prev => {
            const next = !prev;
            socket.emit('voice_mute_update', { roomCode: room.code, userId, isMuted: next });
            setVoiceParticipants(current => current.map(u => u.oderId === userId ? { ...u, isMuted: next } : u));
            return next;
        });
    }, [room, currentUser]);

    const toggleDeafen = useCallback(() => {
        if (!room || !currentUser) return;
        const userId = currentUser.oderId;
        setIsDeafened(prev => {
            const next = !prev;
            if (next && !isMuted) {
                setIsMuted(true);
                socket.emit('voice_mute_update', { roomCode: room.code, userId, isMuted: true });
                setVoiceParticipants(current => current.map(u => u.oderId === userId ? { ...u, isMuted: true } : u));
            }
            socket.emit('voice_deafen_update', { roomCode: room.code, userId, isDeafened: next });
            setVoiceParticipants(current => current.map(u => u.oderId === userId ? { ...u, isDeafened: next } : u));
            return next;
        });
    }, [room, currentUser, isMuted]);

    const toggleNoise = useCallback(() => setIsNoiseOn(prev => !prev), []);
    const toggleEcho = useCallback(() => setIsEchoOn(prev => !prev), []);

    const setUserVolume = useCallback((userId, volume) => {
        setUserVolumes(prev => ({ ...prev, [userId]: volume }));
    }, []);

    const value = useMemo(() => ({
        voiceParticipants,
        setVoiceParticipants,
        isMuted,
        setIsMuted,
        isDeafened,
        setIsDeafened,
        isNoiseOn,
        isEchoOn,
        toggleNoise,
        toggleEcho,
        userVolumes,
        setUserVolume,
        localVolume,
        setLocalVolume,
        voiceTrigger,
        setVoiceTrigger,
        toggleVoice,
        toggleMute,
        toggleDeafen,
        isVoiceOpenMobile,
        setIsVoiceOpenMobile
    }), [
        voiceParticipants, isMuted, isDeafened, isNoiseOn, isEchoOn,
        userVolumes, localVolume, voiceTrigger, isVoiceOpenMobile,
        toggleNoise, toggleEcho, setUserVolume, toggleVoice, toggleMute, toggleDeafen
    ]);

    return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
};

export const useVoice = () => {
    const context = useContext(VoiceContext);
    if (!context) throw new Error('useVoice must be used within VoiceProvider');
    return context;
};
