import { Rnnoise } from '@shiguredo/rnnoise-wasm';
import { CircularBuffer } from './CircularBuffer';

// Constants
const FRAME_SIZE = 480; // RNNoise expects 480 samples @ 48kHz (10ms)
const BUFFER_SIZE = 4096; // ScriptProcessor buffer size (latency tradeoff vs stability)

export class RNNoiseNode {
    constructor(context) {
        this.context = context;
        this.processor = null;
        this.rnnoise = null;
        this.denoiseState = null;
        this.circularBuffer = new CircularBuffer(FRAME_SIZE * 100); // Plenty of buffer
        this.outputBuffer = new CircularBuffer(FRAME_SIZE * 100);
        this.isActive = false;

        // Debug
        this.vadScore = 0;
    }

    async init() {
        if (this.isActive) return;

        try {
            console.log('[RNNoise] Loading WASM module...');
            this.rnnoise = await Rnnoise.load();
            this.denoiseState = this.rnnoise.createDenoiseState();
            console.log('[RNNoise] Denoise state created with frame size:', this.rnnoise.frameSize);

            // Validate frame size matches
            if (this.rnnoise.frameSize !== FRAME_SIZE) {
                console.warn(`[RNNoise] Expected frame size ${FRAME_SIZE} but got ${this.rnnoise.frameSize}`);
            }

            // Create ScriptProcessor
            // bufferSize: 256, 512, 1024, 2048, 4096, 8192, 16384
            // 4096 / 48000 = ~85ms latency (Safe on main thread)
            // 1024 / 48000 = ~21ms (Aggressive)
            // Use 2048 (~42ms) as compromise?
            // Discord uses worklet which is <10ms.
            // Let's try 4096 for stability first, as glitches sound worse than 40ms delay.
            this.processor = this.context.createScriptProcessor(4096, 1, 1);

            this.processor.onaudioprocess = (e) => this.process(e);

            this.isActive = true;
            console.log('[RNNoise] Processor ready');
        } catch (err) {
            console.error('[RNNoise] Initialization failed:', err);
            throw err;
        }
    }

    process(audioProcessingEvent) {
        if (!this.isActive || !this.denoiseState) {
            // Bypass if not ready
            const input = audioProcessingEvent.inputBuffer.getChannelData(0);
            const output = audioProcessingEvent.outputBuffer.getChannelData(0);
            output.set(input);
            return;
        }

        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        const outputData = audioProcessingEvent.outputBuffer.getChannelData(0);

        // Push input to circular buffer
        this.circularBuffer.push(inputData);

        // Process as many 480-sample chunks as available
        let framesProcessed = 0;
        while (this.circularBuffer.available >= FRAME_SIZE) {
            const frame = this.circularBuffer.pop(FRAME_SIZE);
            if (frame) {
                try {
                    // Start processing
                    const vad = this.denoiseState.processFrame(frame);
                    this.vadScore = vad;
                    framesProcessed++;

                    // Push processed frame to output buffer
                    this.outputBuffer.push(frame);
                } catch (e) {
                    console.error('[RNNoise] Processing error:', e);
                    // Fallback: push original frame
                    this.outputBuffer.push(frame);
                }
            }
        }

        // Periodic debug log (every ~2 seconds)
        if (!this._logCounter) this._logCounter = 0;
        this._logCounter++;
        if (this._logCounter % 100 === 0) {
            console.log(`[RNNoise] 🔊 Processing active - Frames: ${framesProcessed}, VAD: ${this.vadScore.toFixed(3)}, Buffer: ${this.circularBuffer.available}/${this.outputBuffer.available}`);
        }

        // Fill output buffer for Web Audio
        const needed = outputData.length;
        const availableOutput = this.outputBuffer.available;

        if (availableOutput >= needed) {
            const outChunk = this.outputBuffer.pop(needed);
            outputData.set(outChunk);
        } else {
            // Underrun: Pad with zeros/silence or previous data?
            // Silence is better than glitches.
            if (availableOutput > 0) {
                const partial = this.outputBuffer.pop(availableOutput);
                outputData.set(partial);
                outputData.fill(0, availableOutput);
            } else {
                outputData.fill(0);
            }
        }
    }

    destroy() {
        if (this.denoiseState) {
            this.denoiseState.destroy();
            this.denoiseState = null;
        }
        if (this.processor) {
            this.processor.disconnect();
            this.processor.onaudioprocess = null;
            this.processor = null;
        }
        this.isActive = false;
    }
}
