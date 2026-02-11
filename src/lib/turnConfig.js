
/**
 * SyncRoom WebRTC Configuration (Centralized)
 * 
 * Includes Google STUN and Metered.ca TURN fallback.
 * Credentials should be set in .env as:
 * VITE_TURN_USER
 * VITE_TURN_PASS
 */

// TOGGLE THIS FOR DEBUGGING ONLY
// TOGGLE THIS FOR DEBUGGING ONLY
export const DEBUG_TURN_ONLY = false; // Set to true to force relay

export const RTC_CONFIG = {
    iceServers: [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302"
            ]
        },
        {
            urls: [
                "turn:global.turn.metered.ca:80",
                "turn:global.turn.metered.ca:80?transport=tcp",
                "turn:global.turn.metered.ca:443",
                "turns:global.turn.metered.ca:443?transport=tcp"
            ],
            username: (import.meta.env.VITE_TURN_USER || '').trim(),
            credential: (import.meta.env.VITE_TURN_PASS || '').trim()
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: DEBUG_TURN_ONLY ? 'relay' : 'all'
};

// Check if credentials are loaded
console.log("TURN USER:", import.meta.env.VITE_TURN_USER);
console.log("TURN PASS:", import.meta.env.VITE_TURN_PASS);
console.log('[TurnConfig] RTC_CONFIG:', RTC_CONFIG);
