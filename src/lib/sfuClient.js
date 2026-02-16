import { Device } from 'mediasoup-client';
import { socket } from './socket';

class SfuClient {
    constructor() {
        this.device = null;
        this.sendTransport = null;
        this.recvTransport = null;
        this.producers = new Map(); // trackId => producer
        this.consumers = new Map(); // producerId => consumer
        this.roomCode = null;
        this.userId = null;
        this.creatingSendTransport = null;
        this.creatingRecvTransport = null;
        this.loaded = false;
        this.isReady = false;
        this.pendingConsumption = []; // { producerId, resolve, reject }
        this.initPromise = null;
        this.initialized = false;
    }

    async init(roomCode, userId) {
        if (this.initialized && this.roomCode === roomCode && this.device?.loaded) {
            console.log(`[SFU] Already initialized for room: ${roomCode}`);
            return Promise.resolve();
        }

        if (this.initPromise) {
            console.log(`[SFU] Initialization already in progress for ${this.roomCode}`);
            return this.initPromise;
        }

        this.initPromise = (async () => {
            this.roomCode = roomCode;
            this.userId = userId;
            this.initialized = true;
            console.log(`[SFU] Initializing for room: ${roomCode}, user: ${userId}`);

            try {
                // 1. Get Router RTP Capabilities
                const routerRtpCapabilities = await this.request('get_router_capabilities', { roomCode });
                console.log('[SFU] Router capabilities received');

                // 2. Load Device
                if (!this.device) {
                    this.device = new Device();
                }

                if (!this.device.loaded) {
                    await this.device.load({ routerRtpCapabilities });
                    console.log('[SFU] Device loaded successfully.');
                } else {
                    console.log('[SFU] Device already loaded');
                }

                console.log('[SFU] Device ready. Can produce video:', this.device.canProduce('video'));
                this.loaded = true;
                this.isReady = true;
                await this.flushPending();
                console.log('[SFU] Initialization complete.');
            } catch (err) {
                console.error('[SFU] Initialization failed:', err);
                this.initPromise = null;
                this.initialized = false;
                throw err;
            }
        })();

        return this.initPromise;
    }

    async flushPending() {
        if (this.pendingConsumption.length > 0) {
            console.log(`[SFU] Flushing ${this.pendingConsumption.length} pending consumptions...`);
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
            console.log('[SFU] Creating send transport...');
            const params = await this.request('create_transport', {
                roomCode: this.roomCode,
                direction: 'send'
            });

            this.sendTransport = this.device.createSendTransport(params);

            this.sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                console.log('[SFU] Send transport connecting...');
                this.request('connect_transport', {
                    roomCode: this.roomCode,
                    transportId: this.sendTransport.id,
                    dtlsParameters
                })
                    .then(() => {
                        console.log('[SFU] Send transport connected');
                        callback();
                    })
                    .catch(errback);
            });

            this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
                try {
                    console.log(`[SFU] Transport.on(produce) triggered for ${kind}`);
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
            console.log('[SFU] Creating recv transport...');
            const params = await this.request('create_transport', {
                roomCode: this.roomCode,
                direction: 'recv'
            });

            this.recvTransport = this.device.createRecvTransport(params);

            this.recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                console.log('[SFU] Recv transport connecting...');
                this.request('connect_transport', {
                    roomCode: this.roomCode,
                    transportId: this.recvTransport.id,
                    dtlsParameters
                })
                    .then(() => {
                        console.log('[SFU] Recv transport connected');
                        callback();
                    })
                    .catch(errback);
            });

            console.log('[SFU] Recv transport created');
            this.creatingRecvTransport = null;
            return this.recvTransport;
        })();

        return this.creatingRecvTransport;
    }

    async produce(track) {
        if (!this.sendTransport) await this.createSendTransport();

        let options = { track };
        if (track.kind === 'video') {
            options.encodings = [{ maxBitrate: 2500000 }];
            options.codecOptions = {
                videoGoogleStartBitrate: 1500000
            };
        } else if (track.kind === 'audio') {
            options.codecOptions = {
                opusStereo: true,
                opusDtx: false
            };
        }

        options.appData = {
            type: 'media',
            userId: this.userId,
            kind: track.kind
        };

        const producer = await this.sendTransport.produce(options);
        this.producers.set(track.id, producer);

        producer.on('transportclose', () => {
            console.log(`[SFU] Producer transport closed: ${producer.id}`);
            this.producers.delete(track.id);
        });

        producer.on('trackended', () => {
            console.log(`[SFU] Producer track ended: ${track.id}`);
            this.closeProducer(track.id);
        });

        return producer;
    }

    async consume(producerId) {
        if (!this.isReady || !this.device?.loaded) {
            console.log(`[SFU] Queueing consumption for ${producerId} until ready...`);
            return new Promise((resolve, reject) => {
                this.pendingConsumption.push({ producerId, resolve, reject });
            });
        }

        if (!this.recvTransport) {
            console.log(`[SFU] Recv transport missing for consume, creating now...`);
            await this.createRecvTransport();
        }

        const rtpCapabilities = this.device.rtpCapabilities;
        console.log(`[SFU] Requesting server to consume producer: ${producerId}`);
        const params = await this.request('consume', {
            roomCode: this.roomCode,
            transportId: this.recvTransport.id,
            producerId,
            rtpCapabilities
        });

        console.log(`[SFU] Server created consumer, local consumption starting...`, params.kind);
        const consumer = await this.recvTransport.consume(params);
        this.consumers.set(producerId, consumer);

        consumer.on('transportclose', () => {
            console.log(`[SFU] Consumer transport closed: ${consumer.id}`);
            this.consumers.delete(producerId);
        });

        consumer.on('producerclose', () => {
            console.log(`[SFU] Producer closed, closing consumer: ${consumer.id}`);
            this.consumers.delete(producerId);
        });

        // Resume consumer on the server
        console.log(`[SFU] Requesting server to resume consumer: ${consumer.id}`);
        await this.request('resume_consumer', {
            roomCode: this.roomCode,
            consumerId: consumer.id
        });
        console.log(`[SFU] Consumer resumed and active: ${consumer.id}`);

        return consumer;
    }

    closeProducer(trackId) {
        const producer = this.producers.get(trackId);
        if (producer) {
            producer.close();
            this.producers.delete(trackId);
        }
    }

    async request(event, data) {
        return new Promise((resolve, reject) => {
            if (!socket.connected) {
                console.warn(`[SFU] Socket not connected for ${event}. SFU requests require an active socket.`);
            }

            socket.emit(event, data, (response) => {
                if (response && response.error) {
                    console.error(`[SFU] Request error for ${event}:`, response.error);
                    reject(response.error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    terminate() {
        console.log('[SFU] Terminating client and cleaning up transports/consumers...');
        if (this.sendTransport) {
            this.sendTransport.close();
            this.sendTransport = null;
        }
        if (this.recvTransport) {
            this.recvTransport.close();
            this.recvTransport = null;
        }
        this.producers.forEach(p => p.close());
        this.consumers.forEach(c => c.close());
        this.producers.clear();
        this.consumers.clear();
        this.loaded = false;
        this.isReady = false;
        this.pendingConsumption = [];
        this.initPromise = null;
        this.initialized = false;
        this.device = null;
        console.log('[SFU] Cleanup complete');
    }
}

export const sfuClient = new SfuClient();
