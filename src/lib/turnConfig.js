
/**
 * SyncRoom WebRTC Configuration (Centralized)
 * 
 * Includes Google STUN and Metered.ca TURN fallback.
 * Credentials should be set in .env as:
 * VITE_TURN_USER
 * VITE_TURN_PASS
 */

export const getIceServers = () => {
    const servers = [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302'
            ]
        }
    ];

    // Add TURN if credentials exist
    const turnUser = import.meta.env.VITE_TURN_USER;
    const turnPass = import.meta.env.VITE_TURN_PASS;

    if (turnUser && turnPass) {
        servers.push({
            urls: 'turn:global.turn.metered.ca:80',
            username: turnUser,
            credential: turnPass
        });
        servers.push({
            urls: 'turn:global.turn.metered.ca:443',
            username: turnUser,
            credential: turnPass
        });
        servers.push({
            urls: 'turn:global.turn.metered.ca:443?transport=tcp',
            username: turnUser,
            credential: turnPass
        });
    }

    return servers;
};

export const RTC_CONFIG = {
    iceServers: getIceServers(),
    iceCandidatePoolSize: 10,
};
