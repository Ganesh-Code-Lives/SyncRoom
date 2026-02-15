import { Device } from 'mediasoup-client';
import { socket } from './socket';

class SfuClient {
    constructor() {
        this.device = null;
        this.sendTransport = null;
        this.recvTransport = null;
        this.producers = new Map(); // track => producer
        this.consumers = new Map(); // producerId => consumer
        this.roomCode = null;
        this.creatingSendTransport = null;
        this.creatingRecvTransport = null;
    }

    async init(roomCode) {
        this.roomCode = roomCode;
        console.log(`[SFU] Initializing for room: ${roomCode}`);

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
    }

    async createSendTransport() {
        if (this.sendTransport) return this.sendTransport;
        if (this.creatingSendTransport) return this.creatingSendTransport;

        this.creatingSendTransport = (async () => {
            console.log('[SFU] Creating send transport...');
            const params = await this.request('create_transport', { roomCode: this.roomCode, direction: 'send' });

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
                        appData
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
            const params = await this.request('create_transport', { roomCode: this.roomCode, direction: 'recv' });

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

        const producer = await this.sendTransport.produce({ track });
        this.producers.set(track.id, producer);

        producer.on('transportclose', () => {
            this.producers.delete(track.id);
        });

        producer.on('trackended', () => {
            this.closeProducer(track.id);
        });

        return producer;
    }

    async consume(producerId) {
        if (!this.recvTransport) {
            console.log('[SFU] Creating recv transport for consumption...');
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
                console.warn(`[SFU] Socket not connected for ${event}, attempting request anyway...`);
            }

            const timeout = setTimeout(() => {
                console.error(`[SFU] Request timeout: ${event}`);
                reject(new Error(`Request timeout: ${event}`));
            }, 10000); // 10s timeout

            socket.emit(event, data, (response) => {
                clearTimeout(timeout);
                if (response && response.error) {
                    reject(response.error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    close() {
        console.log('[SFU] Closing client and cleaning up transports/consumers...');
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
        console.log('[SFU] Cleanup complete');
    }
}

export const sfuClient = new SfuClient();
