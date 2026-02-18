import { Device } from 'mediasoup-client';
import { socket } from './socket';

class SfuVoiceClient {
    constructor() {
        this.device = null;
        this.sendTransport = null;
        this.recvTransport = null;
        this.producers = new Map(); // trackId => producer (local)
        this.consumers = new Map(); // producerId => consumer (remote)
        this.roomCode = null;
        this.userId = null;
        this.creatingSendTransport = null;
        this.creatingRecvTransport = null;
        this.audioStream = null;
        this.loaded = false;
        this.isReady = false;
        this.pendingConsumption = []; // { producerId, resolve, reject }
        this.initPromise = null;
        this.initialized = false;
    }

    async init(roomCode, userId) {
        if (this.initialized && this.roomCode === roomCode && this.device?.loaded) {
            console.log(`[VoiceSFU] Already initialized for room: ${roomCode}`);
            return Promise.resolve();
        }

        if (this.initPromise) {
            console.log(`[VoiceSFU] Initialization already in progress for ${this.roomCode}`);
            return this.initPromise;
        }

        this.initPromise = (async () => {
            this.roomCode = roomCode;
            this.userId = userId;
            this.initialized = true;
            console.log(`[VoiceSFU] Initializing for room: ${roomCode}, user: ${userId}`);

            try {
                // 1. Get Router RTP Capabilities
                const routerRtpCapabilities = await this.request('get_router_capabilities', { roomCode });
                console.log('[VoiceSFU] Router capabilities received');

                // 2. Load Device
                if (!this.device) {
                    this.device = new Device();
                }

                if (!this.device.loaded) {
                    await this.device.load({ routerRtpCapabilities });
                    console.log('[VoiceSFU] Device loaded successfully.');
                } else {
                    console.log('[VoiceSFU] Device already loaded');
                }

                console.log('[VoiceSFU] Device ready. Can produce audio:', this.device.canProduce('audio'));
                this.loaded = true;
                this.isReady = true;
                await this.flushPending();
                console.log('[VoiceSFU] Initialization complete.');
            } catch (err) {
                console.error('[VoiceSFU] Initialization failed:', err);
                this.initPromise = null;
                this.initialized = false;
                throw err;
            }
        })();

        return this.initPromise;
    }

    async flushPending() {
        if (this.pendingConsumption.length > 0) {
            console.log(`[VoiceSFU] Flushing ${this.pendingConsumption.length} pending consumptions...`);
            const consumersToFlush = [...this.pendingConsumption];
            this.pendingConsumption = [];
            for (const item of consumersToFlush) {
                const { producerId, resolve, reject } = item;
                this.consume(producerId).then(resolve).catch(reject);
            }
        }
    }

    async createSendTransport() {
        if (this.sendTransport) return this.sendTransport;
        if (this.creatingSendTransport) return this.creatingSendTransport;

        this.creatingSendTransport = (async () => {
            console.log('[VoiceSFU] Creating send transport...');
            const params = await this.request('create_transport', {
                roomCode: this.roomCode,
                direction: 'send'
            });

            this.sendTransport = this.device.createSendTransport(params);

            this.sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                console.log('[VoiceSFU] Send transport connecting...');
                this.request('connect_transport', {
                    roomCode: this.roomCode,
                    transportId: this.sendTransport.id,
                    dtlsParameters
                })
                    .then(() => {
                        console.log('[VoiceSFU] Send transport connected');
                        callback();
                    })
                    .catch(errback);
            });

            this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
                try {
                    console.log(`[VoiceSFU] Transport.on(produce) triggered for ${kind}`);
                    const { id } = await this.request('produce', {
                        roomCode: this.roomCode,
                        transportId: this.sendTransport.id,
                        kind,
                        rtpParameters,
                        appData: { ...appData, userId: this.userId }
                    });
                    callback({ id });
                } catch (err) {
                    errback(err);
                }
            });

            this.creatingSendTransport = null;
            return this.sendTransport;
        })();

        return this.creatingSendTransport;
    }

    async createRecvTransport() {
        if (this.recvTransport) return this.recvTransport;
        if (this.creatingRecvTransport) return this.creatingRecvTransport;

        this.creatingRecvTransport = (async () => {
            console.log('[VoiceSFU] Creating recv transport...');
            const params = await this.request('create_transport', {
                roomCode: this.roomCode,
                direction: 'recv'
            });

            this.recvTransport = this.device.createRecvTransport(params);

            this.recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                console.log('[VoiceSFU] Recv transport connecting...');
                this.request('connect_transport', {
                    roomCode: this.roomCode,
                    transportId: this.recvTransport.id,
                    dtlsParameters
                })
                    .then(() => {
                        console.log('[VoiceSFU] Recv transport connected');
                        callback();
                    })
                    .catch(errback);
            });

            console.log('[VoiceSFU] Recv transport created');
            this.creatingRecvTransport = null;
            return this.recvTransport;
        })();

        return this.creatingRecvTransport;
    }

    async joinVoice(trackOrConstraints = {}) {
        try {
            let stream;
            let track;

            // Check if input is a MediaStreamTrack
            if (trackOrConstraints instanceof MediaStreamTrack) {
                console.log('[VoiceSFU] Using provided MediaStreamTrack');
                track = trackOrConstraints;
                stream = new MediaStream([track]);
            } else {
                // Input is constraints object
                const constraints = trackOrConstraints;
                console.log('[VoiceSFU] Capturing mic with constraints:', constraints);
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
                track = stream.getAudioTracks()[0];
            }

            this.audioStream = stream;

            if (!this.sendTransport) await this.createSendTransport();

            console.log('[VoiceSFU] Producing audio track...');
            const producer = await this.sendTransport.produce({
                track,
                appData: { type: 'voice' },
                priority: 'high',
                encodings: [
                    { maxBitrate: 64000 } // 64kbps - Discord sweet spot for stability
                ],
                codecOptions: {
                    opusStereo: false, // Force Mono
                    opusDtx: true,     // Enable DTX (Silence Suppression)
                    opusFec: true      // Enable Forward Error Correction
                }
            });

            this.producers.set('voice', producer);

            producer.on('transportclose', () => {
                console.log('[VoiceSFU] Voice producer transport closed');
                this.producers.delete('voice');
            });

            producer.on('trackended', () => {
                console.log("[VoiceSFU] Mic track ended");
            });

            // Notify server application level state
            await this.request('join-voice', { roomCode: this.roomCode, userId: this.userId });

            return { stream, producerId: producer.id };
        } catch (err) {
            console.error('[VoiceSFU] joinVoice failed:', err);
            throw err;
        }
    }

    async replaceAudioTrack(newTrack) {
        const producer = this.producers.get('voice');

        if (!producer || producer.closed) {
            console.warn("[VoiceSFU] Cannot replace track - Producer not found or closed");
            return;
        }

        if (!newTrack || newTrack.readyState === 'ended') {
            console.error("[VoiceSFU] Cannot replace track - New track is invalid or ended", newTrack);
            throw new Error("New audio track is not live");
        }

        try {
            console.log(`[VoiceSFU] Replacing audio track [${newTrack.id}] state:${newTrack.readyState}`);
            await producer.replaceTrack({ track: newTrack });
            console.log("[VoiceSFU] Audio track replaced successfully");
        } catch (err) {
            console.error("[VoiceSFU] replaceTrack failed:", err);
            throw err;
        }
    }

    async consume(producerId) {
        if (!this.isReady || !this.device?.loaded) {
            console.log(`[VoiceSFU] Queueing consumption for ${producerId} until ready...`);
            return new Promise((resolve, reject) => {
                this.pendingConsumption.push({ producerId, resolve, reject });
            });
        }

        if (!this.recvTransport) {
            console.log(`[VoiceSFU] Recv transport missing for consume, creating now...`);
            await this.createRecvTransport();
        }

        const rtpCapabilities = this.device.rtpCapabilities;
        const params = await this.request('consume', {
            roomCode: this.roomCode,
            transportId: this.recvTransport.id,
            producerId,
            rtpCapabilities
        });

        const consumer = await this.recvTransport.consume(params);
        this.consumers.set(producerId, consumer);

        consumer.on('transportclose', () => {
            console.log(`[VoiceSFU] Consumer transport closed: ${consumer.id}`);
            this.consumers.delete(producerId);
        });

        consumer.on('producerclose', () => {
            console.log(`[VoiceSFU] Producer closed, closing consumer: ${consumer.id}`);
            this.consumers.delete(producerId);
        });

        await this.request('resume_consumer', {
            roomCode: this.roomCode,
            consumerId: consumer.id
        });

        return consumer;
    }

    async leaveVoice() {
        console.log('[VoiceSFU] Leaving voice...');
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(t => t.stop());
            this.audioStream = null;
        }

        const producer = this.producers.get('voice');
        if (producer) {
            producer.close();
            this.producers.delete('voice');
        }

        socket.emit('leave-voice', { roomCode: this.roomCode, userId: this.userId });
    }

    async request(event, data) {
        return new Promise((resolve, reject) => {
            if (!socket.connected) {
                console.warn(`[VoiceSFU] Socket not connected for ${event}. SFU requests require an active socket.`);
            }

            socket.emit(event, data, (response) => {
                if (response && response.error) {
                    console.error(`[VoiceSFU] Request error for ${event}:`, response.error);
                    reject(response.error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    terminate() {
        console.log('[VoiceSFU] Terminating client and cleaning up transports/consumers...');
        this.leaveVoice();
        if (this.sendTransport) {
            this.sendTransport.close();
            this.sendTransport = null;
        }
        if (this.recvTransport) {
            this.recvTransport.close();
            this.recvTransport = null;
        }
        this.consumers.forEach(c => c.close());
        this.consumers.clear();
        this.loaded = false;
        this.isReady = false;
        this.pendingConsumption = [];
        this.initPromise = null;
        this.initialized = false;
        this.device = null;
    }
}

export const sfuVoiceClient = new SfuVoiceClient();
