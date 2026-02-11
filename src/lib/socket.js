import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// Robust Socket.IO Configuration for Render/Production Stability
export const socket = io(SOCKET_URL, {
    autoConnect: false,
    reconnection: true,             // Enable reconnection
    reconnectionAttempts: Infinity, // Keep trying forever (don't give up on bad networks)
    reconnectionDelay: 1000,        // Start with 1s delay
    reconnectionDelayMax: 5000,     // Max delay of 5s between retries
    timeout: 20000,                 // Connection timeout (20s)
    transports: ['websocket', 'polling'] // Try WebSocket first, fallback to polling
});

export default socket;
