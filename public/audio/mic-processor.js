/* global AudioWorkletProcessor, registerProcessor */

/**
 * Take capture, running on the audio thread. Buffers the microphone's mono
 * input into fixed-size chunks and posts each one to the main thread with
 * its own peak and RMS, so the main thread never has to touch raw samples to
 * drive a level meter. On stop, whatever is left in the buffer is flushed as
 * a final, shorter chunk.
 *
 * Messages in: start, stop. Messages out: chunk (samples, rms, peak),
 * stopped. The main-thread side lives in app/audio/recorder.ts.
 *
 * This file is served as a static asset because AudioWorklet modules cannot
 * be bundled with the app; keep it self-contained.
 */

/** About 43ms at 48kHz; small enough for a responsive level meter, large enough not to spam postMessage. */
const CHUNK_FRAMES = 2048

class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.recording = false
    this.buffer = new Float32Array(CHUNK_FRAMES)
    this.filled = 0
    this.port.onmessage = event => this.onMessage(event.data)
  }

  onMessage(message) {
    switch (message.type) {
      case 'start':
        this.recording = true
        this.filled = 0
        break
      case 'stop':
        this.recording = false
        this.flush()
        this.port.postMessage({ type: 'stopped' })
        break
    }
  }

  flush() {
    if (this.filled === 0) return
    this.post(this.buffer.subarray(0, this.filled))
    this.filled = 0
  }

  post(samples) {
    const copy = samples.slice()
    let peak = 0
    let sumSquares = 0
    for (let i = 0; i < copy.length; i++) {
      const v = copy[i]
      sumSquares += v * v
      const abs = Math.abs(v)
      if (abs > peak) peak = abs
    }
    this.port.postMessage(
      { type: 'chunk', samples: copy, rms: Math.sqrt(sumSquares / copy.length), peak },
      [copy.buffer],
    )
  }

  process(inputs) {
    if (!this.recording) return true
    const input = inputs[0]
    const channel = input && input[0]
    if (!channel || channel.length === 0) return true

    let offset = 0
    while (offset < channel.length) {
      const n = Math.min(channel.length - offset, CHUNK_FRAMES - this.filled)
      this.buffer.set(channel.subarray(offset, offset + n), this.filled)
      this.filled += n
      offset += n
      if (this.filled === CHUNK_FRAMES) {
        this.post(this.buffer)
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('mic-capture-processor', MicCaptureProcessor)
