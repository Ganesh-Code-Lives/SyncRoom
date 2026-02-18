import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { socket } from '../lib/socket';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';

/**
 * FullscreenChatOverlay
 * 
 * Renders chat messages over the media player ONLY when in fullscreen.
 * Uses React Portals to inject into .media-player-container to ensure visibility
 * while keeping React component tree isolated from MediaPlayer to prevent re-renders.
 */
const FullscreenChatOverlay = ({ isFullscreen }) => {
    // 1. Settings Check (Local Storage for persistence, no global context)
    const [isEnabled, setIsEnabled] = useState(() => {
        return localStorage.getItem('syncroom_show_fs_chat') !== 'false'; // Default TRUE
    });

    // 2. Local State for Messages
    const [messages, setMessages] = useState([]);
    const timeoutsRef = useRef({});

    // 3. Portal Target
    const [portalTarget, setPortalTarget] = useState(null);

    // Find portal target when fullscreen or enabled changes
    useEffect(() => {
        if (isFullscreen && isEnabled) {
            // Target the persistent container instead of the conditional player
            const target = document.querySelector('.video-container');
            console.log('[FullscreenChat] Portal Target:', target);
            setPortalTarget(target);
        } else {
            setPortalTarget(null);
        }
    }, [isFullscreen, isEnabled]);

    // 4. Socket Listener - ISOLATED
    useEffect(() => {
        if (!isEnabled) return;

        const handleNewMessage = (msg) => {
            // Only show user messages, ignore system/updates for overlay
            if (msg.type === 'system' || !msg.content) return;

            const id = msg.id || Date.now();
            const isMobile = window.innerWidth < 768; // Local check for state logic

            setMessages(prev => {
                // Deduplicate by ID
                if (prev.some(m => m.id === msg.id || (m.internalId && m.internalId === msg.id))) return prev;

                const next = [...prev, { ...msg, internalId: id }];
                // Keep max 2 for Desktop, 1 for Mobile
                const max = isMobile ? 1 : 2;
                return next.slice(-max);
            });

            // Set auto-remove timeout
            if (timeoutsRef.current[id]) clearTimeout(timeoutsRef.current[id]);

            const duration = isMobile ? 2500 : 3500;
            timeoutsRef.current[id] = setTimeout(() => {
                setMessages(prev => prev.filter(m => m.internalId !== id));
                delete timeoutsRef.current[id];
            }, duration);
        };

        socket.on('new_message', handleNewMessage);

        // Listen for local echo (optimistic updates)
        const handleLocalMessage = (e) => {
            if (e.detail) handleNewMessage(e.detail);
        };
        window.addEventListener('syncroom:local_message', handleLocalMessage);

        return () => {
            socket.off('new_message', handleNewMessage);
            window.removeEventListener('syncroom:local_message', handleLocalMessage);
            // Cleanup timeouts
            Object.values(timeoutsRef.current).forEach(clearTimeout);
            timeoutsRef.current = {};
        };
    }, [isEnabled]);

    // 5. Mobile Detection (Simple width check)
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    if (!portalTarget || !isFullscreen || !isEnabled) return null;

    // 6. Render via Portal
    return ReactDOM.createPortal(
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none', // Pass clicks through to video
                zIndex: 90, // Above video, below controls
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'flex-start', // Always left aligned now
                padding: isMobile ? '16px 12px' : '16px 24px', // Similar padding
                overflow: 'hidden'
            }}
        >
            <AnimatePresence>
                {messages.map((msg) => (
                    <motion.div
                        key={msg.internalId}
                        layout
                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        transition={{ type: "spring", stiffness: 500, damping: 30, mass: 1 }}
                        style={{
                            pointerEvents: 'none',
                            marginBottom: '8px',
                            display: 'flex',
                            justifyContent: 'flex-start',
                            width: isMobile ? '100%' : 'auto',
                            transformOrigin: 'top left' // Ensure scaling doesn't jiggle layout
                        }}
                    >
                        {/* UNIFIED DESIGN: Premium Glass Bubble */}
                        <div style={{
                            background: 'rgba(10, 10, 15, 0.25)', // More transparent
                            backdropFilter: 'blur(20px)', // Stronger premium blur
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '20px', // Slightly rounder
                            padding: '12px 18px', // More breathing room
                            maxWidth: isMobile ? '85%' : '300px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.2)', // Deeper, softer shadow
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
                                <img
                                    src={msg.senderAvatar || `https://ui-avatars.com/api/?name=${msg.senderName}&background=random`}
                                    alt=""
                                    style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }}
                                />
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                    <span style={{
                                        color: '#fff',
                                        fontWeight: '600',
                                        fontSize: '0.85rem',
                                        textShadow: '0 1px 2px rgba(0,0,0,0.5)' // Legibility boost
                                    }}>
                                        {msg.senderName}
                                    </span>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>
                                        Now
                                    </span>
                                </div>
                            </div>
                            <span style={{
                                color: 'rgba(255,255,255,0.95)',
                                fontSize: '0.9rem',
                                lineHeight: '1.45',
                                textShadow: '0 1px 2px rgba(0,0,0,0.5)', // Legibility boost
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                            }}>
                                {msg.content}
                            </span>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>,
        portalTarget
    );
};

export default React.memo(FullscreenChatOverlay);
