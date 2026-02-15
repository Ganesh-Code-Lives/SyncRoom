import mediasoup from 'mediasoup';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to manually load .env (since dotenv might not be installed)
const loadEnv = () => {
    try {
        const envPath = path.resolve(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            const envConfig = fs.readFileSync(envPath, 'utf8');
            envConfig.split('\n').forEach(line => {
                const [key, value] = line.split('=');
                if (key && value) {
                    process.env[key.trim()] = value.trim();
                }
            });
            console.log('[Env] Loaded .env file manually');
        }
    } catch (e) {
        console.warn('[Env] Failed to load .env manually:', e);
    }
};
loadEnv();

// Helper to get Local LAN IP
const getLocalIp = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
            if ('IPv4' !== iface.family || iface.internal) {
                continue;
            }
            return iface.address;
        }
    }
    return '127.0.0.1';
};

const mediaCodecs = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        parameters: {
            'sprop-stereo': 1
        }
    },
    {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
            'x-google-start-bitrate': 1000,
        },
    },
];

class MediasoupManager {
    constructor() {
        this.workers = [];
        this.nextWorkerIdx = 0;
        this.rooms = new Map(); // roomId => { router, peers: Map(socketId => { transports, producers, consumers }) }
        this.announcedIp = '127.0.0.1'; // Default
        this.io = null; // Store IO for out-of-band notifications
    }

    async init() {
        // 1. Determine Announced IP
        this.announcedIp = await this.determineAnnouncedIp();
        console.log(`[Mediasoup] Final Announced IP: ${this.announcedIp}`);

        // 2. Create Workers
        console.log('[Mediasoup] Creating 2 workers...');
        const numWorkers = 2;
        for (let i = 0; i < numWorkers; i++) {
            console.log(`[Mediasoup] Spawning worker ${i + 1}/${numWorkers}...`);
            const worker = await mediasoup.createWorker({
                rtcMinPort: 10000,
                rtcMaxPort: 10100,
            });

            worker.on('died', () => {
                console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
                setTimeout(() => process.exit(1), 2000);
            });

            this.workers.push(worker);
            console.log(`[Mediasoup] Worker ${i + 1} created (pid: ${worker.pid})`);
        }
        console.log(`[Mediasoup] SUCCESS: Initialized ${this.workers.length} workers`);
    }

    async determineAnnouncedIp() {
        // 1. Check Environment Variable (Render/Manual)
        if (process.env.ANNOUNCED_IP) {
            console.log(`[Mediasoup] Using ANNOUNCED_IP from env: ${process.env.ANNOUNCED_IP}`);
            return process.env.ANNOUNCED_IP;
        }

        // 2. Production Mode: Auto-detect Public IP
        if (process.env.NODE_ENV === 'production') {
            try {
                console.log('[Mediasoup] Production mode detected. Auto-detecting Public IP...');
                const ip = await new Promise((resolve, reject) => {
                    const req = http.get('http://api.ipify.org', (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => resolve(data.trim()));
                    });
                    req.on('error', reject);
                    req.setTimeout(3000, () => {
                        req.destroy();
                        reject(new Error('Timeout'));
                    });
                });
                console.log(`[Mediasoup] Auto-detected Public IP: ${ip}`);
                return ip;
            } catch (err) {
                console.warn(`[Mediasoup] Public IP auto-detection failed: ${err.message}`);
                console.warn('[Mediasoup] Falling back to Local IP even in production!');
            }
        } else {
            console.log('[Mediasoup] Development mode detected (NODE_ENV != production). Skipping Public IP auto-detect.');
        }

        // 3. Fallback / Development: Local LAN IP
        const localIp = getLocalIp();
        console.log(`[Mediasoup] Using Local LAN IP: ${localIp}`);
        return localIp;
    }

    getWorker() {
        const worker = this.workers[this.nextWorkerIdx];
        this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
        return worker;
    }

    async getOrCreateRoom(roomId) {
        if (this.rooms.has(roomId)) {
            return this.rooms.get(roomId);
        }

        console.log(`[Mediasoup] 🟢 Creating new room: ${roomId}`); // DEBUG LOG

        const worker = this.getWorker();
        const router = await worker.createRouter({ mediaCodecs });
        const room = {
            router,
            peers: new Map(),
            producers: new Map() // Centralized room-level producer tracking: id => { producer, socketId, type }
        };
        this.rooms.set(roomId, room);
        console.log(`[Mediasoup] Room created: ${roomId}`);
        return room;
    }

    async createWebRtcTransport(router) {
        console.log(`[Mediasoup] 🛠 Creating WebRTC Transport (Announced IP: ${this.announcedIp})`); // DEBUG LOG
        const transport = await router.createWebRtcTransport({
            listenIps: [
                {
                    ip: '0.0.0.0',
                    announcedIp: this.announcedIp, // Use resolved IP (Env > Public > Local)
                }
            ],
            enableUdp: true, // Keep UDP enabled just in case
            enableTcp: true,
            preferUdp: false, // Render/Railway often block UDP
            preferTcp: true,  // Force TCP fallback for restricted networks
            initialAvailableOutgoingBitrate: 1500000, // 1.5 Mbps
            minimumAvailableOutgoingBitrate: 800000,  // 800 kbps
        });

        // Add additional debug logs or handling if needed
        return {
            transport,
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    ...(process.env.VITE_TURN_USER ? [{
                        urls: 'turn:global.turn.metered.ca:80',
                        username: process.env.VITE_TURN_USER,
                        credential: process.env.VITE_TURN_PASS
                    }] : [])
                ]
            }
        };
    }

    getPeer(room, socketId) {
        if (!room.peers.has(socketId)) {
            console.log(`[Mediasoup] Adding peer ${socketId} to room`);
            room.peers.set(socketId, {
                transports: new Map(),
                producers: new Map(),
                consumers: new Map()
            });
        }
        return room.peers.get(socketId);
    }

    cleanupPeer(socketId) {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.peers.has(socketId)) {
                console.log(`[Mediasoup] Cleaning up disconnected peer: ${socketId} from room ${roomId}`);
                const peer = room.peers.get(socketId);

                peer.transports.forEach(t => {
                    try { t.close(); } catch (e) { }
                });
                peer.producers.forEach((p, prodId) => {
                    try {
                        p.close();
                        room.producers.delete(prodId);
                        // Notify room so consumers can clean up
                        if (this.io) {
                            console.log(`[Mediasoup] Notifying room ${roomId} of producer close: ${prodId}`);
                            this.io.to(roomId).emit('producer_closed', { producerId: prodId });
                        }
                    } catch (e) { }
                });
                peer.consumers.forEach(c => {
                    try { c.close(); } catch (e) { }
                });

                room.peers.delete(socketId);
                console.log(`[Mediasoup] Peer ${socketId} removed. Current producers in room: ${room.producers.size}`);
            }
        }

    }

    async handleSocket(socket, io) {
        this.io = io; // Keep reference for cleanup
        console.log(`[Mediasoup] Registering handlers for socket: ${socket.id}`);

        socket.on('get_router_capabilities', async ({ roomCode }, callback) => {
            console.log(`[Mediasoup] get_router_capabilities for room ${roomCode} from ${socket.id}`);
            try {
                const room = await this.getOrCreateRoom(roomCode);

                // When someone requests capabilities, we also notify them of existing producers (excluding voice if needed, but for now generic)
                const existingProducers = Array.from(room.producers.keys())
                    .filter(id => room.producers.get(id).type !== 'voice'); // Hide voice producers from screen share flow

                if (existingProducers.length > 0) {
                    console.log(`[Mediasoup] Notifying ${socket.id} of ${existingProducers.length} existing producers in ${roomCode}`);
                    socket.emit('existing-producers', { producerIds: existingProducers });
                }

                callback(room.router.rtpCapabilities);
            } catch (err) {
                console.error('[Mediasoup] get_router_capabilities error:', err);
                callback({ error: err.message });
            }
        });

        socket.on('mediasoup_ping', (data, cb) => {
            console.log(`[Mediasoup] PING received from ${socket.id}`);
            if (typeof cb === 'function') {
                cb({ pong: true });
            } else if (typeof data === 'function') {
                data({ pong: true });
            }
        });

        socket.on('create_transport', async ({ roomCode, direction }, callback) => {
            console.log(`[Mediasoup] create_transport (${direction}) for room ${roomCode} from ${socket.id}`);
            try {
                const room = await this.getOrCreateRoom(roomCode);
                const { transport, params } = await this.createWebRtcTransport(room.router);

                const peer = this.getPeer(room, socket.id);
                peer.transports.set(transport.id, transport);

                transport.on('dtlsstatechange', (dtlsState) => {
                    console.log(`[Mediasoup] Transport ${transport.id} DTLS state changed to: ${dtlsState} (Peer: ${socket.id})`);
                    if (dtlsState === 'closed') transport.close();
                });

                callback(params);
            } catch (err) {
                console.error('[Mediasoup] create_transport error:', err);
                callback({ error: err.message });
            }
        });

        socket.on('connect_transport', async ({ roomCode, transportId, dtlsParameters }, callback) => {
            console.log(`[Mediasoup] connect_transport ${transportId} from ${socket.id}`);
            try {
                const room = await this.getOrCreateRoom(roomCode);
                const peer = this.getPeer(room, socket.id);
                const transport = peer.transports.get(transportId);

                if (transport) {
                    await transport.connect({ dtlsParameters });
                    callback({ success: true });
                } else {
                    console.error(`[Mediasoup] Transport ${transportId} not found for peer ${socket.id}`);
                    callback({ error: 'Transport not found' });
                }
            } catch (err) {
                console.error('[Mediasoup] connect_transport error:', err);
                callback({ error: err.message });
            }
        });

        socket.on('produce', async ({ roomCode, transportId, kind, rtpParameters, appData }, callback) => {
            console.log(`[Mediasoup] produce request for ${kind} from ${socket.id}`);
            try {
                const room = await this.getOrCreateRoom(roomCode);
                const peer = this.getPeer(room, socket.id);
                const transport = peer.transports.get(transportId);

                if (!transport) {
                    console.error(`[Mediasoup] Produce FAIL: Transport ${transportId} not found`);
                    return callback({ error: 'Transport not found' });
                }

                const producer = await transport.produce({ kind, rtpParameters, appData });
                peer.producers.set(producer.id, producer);
                room.producers.set(producer.id, {
                    producer,
                    socketId: socket.id,
                    userId: socket.userId || appData?.userId,
                    type: appData?.type || 'media'
                });

                console.log(`[Mediasoup] Producer CREATED & STORED: id=${producer.id}, kind=${producer.kind}, type=${appData?.type}, peer=${socket.id}`);

                producer.on('transportclose', () => {
                    console.log(`[Mediasoup] Producer CLOSED (transportclose): id=${producer.id}`);
                    producer.close();
                    peer.producers.delete(producer.id);
                    room.producers.delete(producer.id);
                });

                // Notify other peers in the room about the new producer
                // Separation: Voice notifications use voice-specific events if it's voice
                if (appData?.type === 'voice') {
                    console.log(`[Mediasoup] Notifying room ${roomCode} about new voice producer ${producer.id}`);
                    socket.to(roomCode).emit('voice-new-producer', {
                        producerId: producer.id,
                        userId: socket.userId || socket.id
                    });
                } else {
                    console.log(`[Mediasoup] Notifying room ${roomCode} about new media producer ${producer.id}`);
                    socket.to(roomCode).emit('new_producer', { producerId: producer.id, kind: producer.kind });
                }

                callback({ id: producer.id });
            } catch (err) {
                console.error('[Mediasoup] produce error:', err);
                callback({ error: err.message });
            }
        });

        socket.on('consume', async ({ roomCode, transportId, producerId, rtpCapabilities }, callback) => {
            try {
                const room = await this.getOrCreateRoom(roomCode);

                if (!room.router.canConsume({ producerId, rtpCapabilities })) {
                    console.error(`[Mediasoup] consume FAIL: Peer ${socket.id} cannot consume producer ${producerId}`);
                    return callback({ error: 'Cannot consume producer with provided capabilities' });
                }

                const peer = this.getPeer(room, socket.id);
                const transport = peer.transports.get(transportId);
                if (!transport) {
                    console.error(`[Mediasoup] consume FAIL: Transport ${transportId} not found for peer ${socket.id}`);
                    return callback({ error: 'Transport not found' });
                }

                const consumer = await transport.consume({
                    producerId,
                    rtpCapabilities,
                    paused: true,
                });

                peer.consumers.set(consumer.id, consumer);
                console.log(`[Mediasoup] Consumer CREATED: id=${consumer.id}, producerId=${producerId}, peer=${socket.id}`);

                consumer.on('transportclose', () => {
                    console.log(`[Mediasoup] Consumer CLOSED (transportclose): id=${consumer.id}`);
                    consumer.close();
                    peer.consumers.delete(consumer.id);
                });

                consumer.on('producerclose', () => {
                    console.log(`[Mediasoup] Consumer CLOSED (producerclose): id=${consumer.id}`);
                    consumer.close();
                    peer.consumers.delete(consumer.id);
                    socket.emit('consumer_closed', { consumerId: consumer.id });
                });

                const producerData = room.producers.get(producerId);

                callback({
                    id: consumer.id,
                    producerId,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                    appData: { userId: producerData?.userId }
                });
            } catch (err) {
                console.error('[Mediasoup] consume error:', err);
                callback({ error: err.message });
            }
        });

        socket.on('resume_consumer', async ({ roomCode, consumerId }, callback) => {
            try {
                const room = await this.getOrCreateRoom(roomCode);
                const peer = this.getPeer(room, socket.id);
                const consumer = peer.consumers.get(consumerId);

                if (consumer) {
                    await consumer.resume();
                    console.log(`[Mediasoup] Consumer RESUMED: id=${consumerId}`);
                    callback({ success: true });
                } else {
                    callback({ error: 'Consumer not found' });
                }
            } catch (err) {
                console.error('[Mediasoup] resume_consumer error:', err);
                callback({ error: err.message });
            }
        });

        socket.on('get_producers', async (data, callback) => {
            if (!data) return callback({ error: 'No data provided' });
            const { roomCode, type } = data;
            console.log(`[Mediasoup] get_producers (type: ${type}) for room ${roomCode} from ${socket.id}`);
            try {
                const room = await this.getOrCreateRoom(roomCode);
                const results = [];
                for (const [prodId, prodData] of room.producers.entries()) {
                    if (prodData.socketId === socket.id) continue;
                    if (type && prodData.type !== type) continue;
                    if (!type && prodData.type === 'voice') continue; // Default hide voice

                    results.push({ producerId: prodId, kind: prodData.producer.kind, type: prodData.type });
                }
                callback(results);
            } catch (err) {
                console.error('[Mediasoup] get_producers error:', err);
                callback({ error: err.message });
            }
        });

    }
}

export const mediasoupManager = new MediasoupManager();

