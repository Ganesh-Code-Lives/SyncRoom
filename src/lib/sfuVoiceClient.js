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
    }

    async init(roomCode, userId) {
        this.roomCode = roomCode;
        this.userId = userId;
        console.log(`[VoiceSFU] Initializing for room: ${roomCode}, user: ${userId}`);

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
    }

    async createSendTransport() {
        if (this.sendTransport) return this.sendTransport;
        if (this.creatingSendTransport) return this.creatingSendTransport;

        this.creatingSendTransport = (async () => {
            console.log('[VoiceSFU] Creating send transport...');
            const params = await this.request('create_transport', { roomCode: this.roomCode, direction: 'send' });

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
                        appData: { ...appData, userId: this.userId } // Ensure userId is attached
                    });
                    callback({ id });
                } catch (err) {
                    errback(err);
                }
            });

            this.sendTransport.on('connectionstatechange', (state) => {
                console.log(`[VoiceSFU] Send transport connection state: ${state}`);
                if (state === 'failed') {
                    console.error('[VoiceSFU] Send transport failed.');
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
            const params = await this.request('create_transport', { roomCode: this.roomCode, direction: 'recv' });

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

            this.recvTransport.on('connectionstatechange', (state) => {
                console.log(`[VoiceSFU] Recv transport connection state: ${state}`);
                if (state === 'failed') {
                    console.error('[VoiceSFU] Recv transport failed');
                }
            });

            console.log('[VoiceSFU] Recv transport created');
            this.creatingRecvTransport = null;
            return this.recvTransport;
        })();

        return this.creatingRecvTransport;
    }

    async joinVoice(constraints = {}) {
        try {
            console.log('[VoiceSFU] Capturing mic with constraints:', constraints);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: { ideal: constraints.echoCancellation ?? true },
                    noiseSuppression: { ideal: constraints.noiseSuppression ?? true },
                    autoGainControl: { ideal: true },
                    channelCount: { ideal: 1 },
                    sampleRate: { ideal: 48000 },
                    sampleSize: { ideal: 16 },
                    latency: { ideal: 0.01 },
                    // Chrome legacy support for deep suppression
                    googEchoCancellation: { ideal: true },
                    googAutoGainControl: { ideal: true },
                    googNoiseSuppression: { ideal: true },
                    googHighpassFilter: { ideal: true }
                },
                video: false
            });
            this.audioStream = stream;
            const track = stream.getAudioTracks()[0];

            // Step 1: Quality Debugging
            console.log("[VoiceSFU] Supported constraints:", navigator.mediaDevices.getSupportedConstraints());
            console.log("[VoiceSFU] Applied track settings:", track.getSettings());
            console.log("[VoiceSFU] Applied track constraints:", track.getConstraints());

            if (!this.sendTransport) await this.createSendTransport();

            console.log('[VoiceSFU] Producing audio track...');
            const producer = await this.sendTransport.produce({
                track,
                appData: { type: 'voice' },
                priority: 'high',
                codecOptions: {
                    opusStereo: false, // Voice is better in Mono
                    opusDtx: true,     // Transmit only when speaking
                    opusFec: true      // Forward Error Correction
                }
            });

            // Bitrate limit to 64kbps
            try {
                const params = producer.rtpSender.getParameters();
                if (!params.encodings) params.encodings = [{}];
                params.encodings[0].maxBitrate = 64000;
                await producer.rtpSender.setParameters(params);
                console.log("[VoiceSFU] Bitrate capped at 64kbps");
            } catch (e) {
                console.warn("[VoiceSFU] Failed to cap bitrate:", e);
            }

            this.producers.set('voice', producer);

            producer.on('transportclose', () => {
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
        if (!producer) return;

        try {
            console.log("[VoiceSFU] Replacing audio track in producer...");
            await producer.replaceTrack({ track: newTrack });
            console.log("[VoiceSFU] Audio track replaced successfully");
        } catch (err) {
            console.error("[VoiceSFU] replaceTrack failed:", err);
            throw err;
        }
    }

    async consume(producerId) {
        if (!this.recvTransport) await this.createRecvTransport();

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
            this.consumers.delete(producerId);
        });

        consumer.on('producerclose', () => {
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
            socket.emit(event, data, (response) => {
                if (response && response.error) {
                    reject(response.error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    close() {
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
    }
}

export const sfuVoiceClient = new SfuVoiceClient();
