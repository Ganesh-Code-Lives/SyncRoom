export class CircularBuffer {
    constructor(size) {
        this.buffer = new Float32Array(size);
        this.writePtr = 0;
        this.readPtr = 0;
        this.available = 0;
        this.capacity = size;
    }

    push(data) {
        if (data.length > this.capacity - this.available) {
            // Drop old data if buffer full? or error?
            // For real-time audio, dropping is safer than crashing, but ideally buffer is large enough.
            console.warn("Buffer overflow/underrun - dropping audio frames");
            this.readPtr = (this.readPtr + data.length) % this.capacity; // Skip ahead
            this.available = Math.max(0, this.available - data.length); // Actually this logic is wrong for simple skip
            // Re-sync: Just reset
            this.writePtr = 0;
            this.readPtr = 0;
            this.available = 0;
        }

        for (let i = 0; i < data.length; i++) {
            this.buffer[this.writePtr] = data[i];
            this.writePtr = (this.writePtr + 1) % this.capacity;
        }
        this.available += data.length;
    }

    pop(size) {
        if (this.available < size) return null;

        const output = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            output[i] = this.buffer[this.readPtr];
            this.readPtr = (this.readPtr + 1) % this.capacity;
        }
        this.available -= size;
        return output;
    }

    clear() {
        this.writePtr = 0;
        this.readPtr = 0;
        this.available = 0;
    }
}
