/* global AudioWorkletProcessor, registerProcessor, sampleRate */

/**
 * The Backing Track player, running on the audio thread.
 *
 * The processor owns the decoded Backing Track and pulls from it at the pace
 * the tempo asks for, pushing every frame through a Rubber Band stretcher
 * (WebAssembly, real-time mode) that applies pitch and tempo. Because the
 * processor itself decides how much input to consume, slowing down and
 * speeding up both work without a growing buffer, and the song position it
 * reports is song time rather than wall time.
 *
 * Messages in: init (the Rubber Band wasm bytes), load (channel data),
 * play, pause, seek, adjust, unload. Messages out: ready, loaded, position,
 * ended, error. The main-thread side lives in app/audio/engine.ts.
 *
 * This file is served as a static asset because AudioWorklet modules cannot
 * be bundled with the app; keep it self-contained.
 */

const BLOCK = 128
/** Input frames handed to Rubber Band per feed; bounds latency and wasm scratch memory. */
const CHUNK = 8192
/** Output frames between position reports (about 46 ms at 44.1 kHz). */
const REPORT_EVERY = 2048

// RubberBandOptions bit flags (rubberband-c.h).
const OPTION_PROCESS_REAL_TIME = 0x00000001
const OPTION_THREADING_NEVER = 0x00010000
const OPTION_PITCH_HIGH_CONSISTENCY = 0x04000000
const OPTION_CHANNELS_TOGETHER = 0x10000000
/**
 * R2 engine, real time, no threads (none in wasm), pitch mode that tolerates
 * live changes without discontinuities, channels processed together for a
 * stable stereo image.
 */
const OPTIONS = OPTION_PROCESS_REAL_TIME
  | OPTION_THREADING_NEVER
  | OPTION_PITCH_HIGH_CONSISTENCY
  | OPTION_CHANNELS_TOGETHER

const WASI_ENOSYS = 52

class BackingTrackProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.wasm = null
    this.heap = { f32: null, u32: null, u8: null }
    this.state = 0
    this.channels = null
    this.length = 0
    this.channelCount = 0
    this.inPtrs = []
    this.outPtrs = []
    this.inPtrArray = 0
    this.outPtrArray = 0
    this.playing = false
    this.readFrame = 0
    this.positionFrames = 0
    this.timeRatio = 1
    this.pitchScale = 1
    this.padRemaining = 0
    this.discardRemaining = 0
    this.finalSent = false
    this.sinceReport = 0
    this.port.onmessage = event => this.onMessage(event.data)
  }

  async onMessage(message) {
    try {
      switch (message.type) {
        case 'init':
          await this.init(message.wasm)
          this.port.postMessage({ type: 'ready' })
          break
        case 'load':
          this.load(message.channels)
          this.port.postMessage({ type: 'loaded', frames: this.length })
          break
        case 'play':
          if (this.readFrame >= this.length && this.finalSent) this.seek(0)
          this.playing = true
          this.report()
          break
        case 'pause':
          this.playing = false
          this.report()
          break
        case 'seek':
          this.seek(message.frame)
          this.report()
          break
        case 'adjust':
          this.adjust(message.timeRatio, message.pitchScale)
          break
        case 'unload':
          this.unload()
          break
      }
    }
    catch (error) {
      this.port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  async init(bytes) {
    const heap = this.heap
    let memory = null
    const refresh = () => {
      heap.u8 = new Uint8Array(memory.buffer)
      heap.u32 = new Uint32Array(memory.buffer)
      heap.f32 = new Float32Array(memory.buffer)
    }
    const unsupported = () => WASI_ENOSYS
    const { instance } = await WebAssembly.instantiate(bytes, {
      env: { emscripten_notify_memory_growth: refresh },
      wasi_snapshot_preview1: {
        proc_exit: unsupported,
        fd_read: unsupported,
        fd_write: unsupported,
        fd_seek: unsupported,
        fd_close: unsupported,
        environ_sizes_get: unsupported,
        environ_get: unsupported,
        clock_time_get: unsupported,
      },
    })
    memory = instance.exports.memory
    refresh()
    instance.exports._initialize()
    this.wasm = instance.exports
  }

  load(channels) {
    if (!this.wasm) throw new Error('Rubber Band is not initialised')
    this.unload()
    this.channels = channels
    this.channelCount = channels.length
    this.length = channels[0] ? channels[0].length : 0

    const wasm = this.wasm
    this.inPtrArray = wasm.wasm_malloc(this.channelCount * 4)
    this.outPtrArray = wasm.wasm_malloc(this.channelCount * 4)
    for (let ch = 0; ch < this.channelCount; ch++) {
      const inPtr = wasm.wasm_malloc(CHUNK * 4)
      const outPtr = wasm.wasm_malloc(BLOCK * 4)
      this.inPtrs.push(inPtr)
      this.outPtrs.push(outPtr)
      // Pointer arrays are written after every malloc so memory growth cannot stale them.
      this.heap.u32[(this.inPtrArray >> 2) + ch] = inPtr
      this.heap.u32[(this.outPtrArray >> 2) + ch] = outPtr
    }

    this.state = wasm.rb_new(sampleRate, this.channelCount, OPTIONS, this.timeRatio, this.pitchScale)
    wasm.rb_set_max_process_size(this.state, CHUNK)
    this.seek(0)
  }

  unload() {
    this.playing = false
    if (this.wasm && this.state) {
      this.wasm.rb_delete(this.state)
      for (const ptr of this.inPtrs) this.wasm.wasm_free(ptr)
      for (const ptr of this.outPtrs) this.wasm.wasm_free(ptr)
      this.wasm.wasm_free(this.inPtrArray)
      this.wasm.wasm_free(this.outPtrArray)
    }
    this.state = 0
    this.inPtrs = []
    this.outPtrs = []
    this.inPtrArray = 0
    this.outPtrArray = 0
    this.channels = null
    this.length = 0
    this.readFrame = 0
    this.positionFrames = 0
  }

  adjust(timeRatio, pitchScale) {
    this.timeRatio = timeRatio
    this.pitchScale = pitchScale
    if (this.state) {
      this.wasm.rb_set_time_ratio(this.state, timeRatio)
      this.wasm.rb_set_pitch_scale(this.state, pitchScale)
    }
  }

  /**
   * Restart the stretcher at a song frame. Rubber Band asks for a run of
   * silence before the first real input and then produces a start delay of
   * output that must be dropped, so the first audible frame is the seek target.
   */
  seek(frame) {
    const target = Math.max(0, Math.min(Math.floor(frame), this.length))
    this.readFrame = target
    this.positionFrames = target
    this.finalSent = false
    if (!this.state) return
    const wasm = this.wasm
    wasm.rb_reset(this.state)
    wasm.rb_set_time_ratio(this.state, this.timeRatio)
    wasm.rb_set_pitch_scale(this.state, this.pitchScale)
    this.padRemaining = wasm.rb_get_preferred_start_pad(this.state)
    this.discardRemaining = wasm.rb_get_start_delay(this.state)
  }

  available() {
    const n = this.wasm.rb_available(this.state)
    return n > 0 ? n : 0
  }

  /** Hand Rubber Band the next run of input: start padding first, then song, flagging the end. */
  feed() {
    const wasm = this.wasm
    const f32 = this.heap.f32
    if (this.padRemaining > 0) {
      const n = Math.min(this.padRemaining, CHUNK)
      for (let ch = 0; ch < this.channelCount; ch++) {
        f32.fill(0, this.inPtrs[ch] >> 2, (this.inPtrs[ch] >> 2) + n)
      }
      wasm.rb_process(this.state, this.inPtrArray, n, 0)
      this.padRemaining -= n
      return
    }
    const remaining = this.length - this.readFrame
    if (remaining <= 0) {
      this.finalSent = true
      return
    }
    const required = Math.max(wasm.rb_get_samples_required(this.state), BLOCK)
    const n = Math.min(remaining, CHUNK, required)
    for (let ch = 0; ch < this.channelCount; ch++) {
      f32.set(this.channels[ch].subarray(this.readFrame, this.readFrame + n), this.inPtrs[ch] >> 2)
    }
    const final = this.readFrame + n >= this.length
    wasm.rb_process(this.state, this.inPtrArray, n, final ? 1 : 0)
    this.readFrame += n
    if (final) this.finalSent = true
  }

  /** Retrieve up to `n` output frames into the wasm output buffers, feeding input as needed. */
  pull(n) {
    while (this.available() < n && !this.finalSent) this.feed()
    const avail = this.available()
    if (avail === 0) return 0
    return this.wasm.rb_retrieve(this.state, this.outPtrArray, Math.min(n, avail))
  }

  report() {
    this.sinceReport = 0
    this.port.postMessage({
      type: 'position',
      frame: Math.min(this.positionFrames, this.length),
      playing: this.playing,
    })
  }

  process(_inputs, outputs) {
    if (!this.playing || !this.state) return true
    const out = outputs[0]

    while (this.discardRemaining > 0) {
      const got = this.pull(Math.min(this.discardRemaining, BLOCK))
      if (got === 0) break
      this.discardRemaining -= got
    }

    const got = this.pull(BLOCK)
    if (got === 0) {
      if (this.finalSent) {
        this.playing = false
        this.positionFrames = this.length
        this.report()
        this.port.postMessage({ type: 'ended' })
      }
      return true
    }

    const f32 = this.heap.f32
    for (let ch = 0; ch < out.length; ch++) {
      // A mono Backing Track plays on every output channel.
      const start = this.outPtrs[Math.min(ch, this.channelCount - 1)] >> 2
      out[ch].set(f32.subarray(start, start + got))
    }

    // Each output frame is 1/timeRatio of a song frame.
    this.positionFrames += got / this.timeRatio
    this.sinceReport += got
    if (this.sinceReport >= REPORT_EVERY) this.report()
    return true
  }
}

registerProcessor('backing-track-processor', BackingTrackProcessor)
