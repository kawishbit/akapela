/**
 * Rubber Band, compiled to WebAssembly, driven over a whole signal at once.
 *
 * This is the Mix render's stretch, and it is deliberately the same build and
 * the same options as the live preview's AudioWorklet
 * (`public/audio/rubberband-processor.js`), so the Mix a singer downloads
 * sounds like what they sang over (ADR 0003, ADR 0004 amendments). It used to
 * be ffmpeg's `rubberband` filter, which tied every bundled ffmpeg to a
 * librubberband build that no publisher ships for Apple Silicon.
 *
 * The worklet cannot import this file, so the options and the instantiation
 * are written out twice; `tests/unit/stretch/rubberband.test.ts` holds the two
 * option sets together.
 *
 * Runnable by Node directly, with no bundler: imported by `stretch-cli.ts`,
 * which is itself spawned as a subprocess. Hence erasable-only TypeScript and
 * no imports of anything that is not Node itself.
 */

/** Input frames handed to Rubber Band per call, the same bound the worklet uses. */
const CHUNK = 8192
/** The fewest input frames per call: the worklet's render quantum, so blocks are sized as they are live. */
const BLOCK = 128

// RubberBandOptions bit flags (rubberband-c.h).
const OPTION_PROCESS_REAL_TIME = 0x00000001
const OPTION_THREADING_NEVER = 0x00010000
const OPTION_PITCH_HIGH_CONSISTENCY = 0x04000000
const OPTION_CHANNELS_TOGETHER = 0x10000000

/**
 * The worklet's options, verbatim: R2 engine, real-time mode, no threads,
 * high-consistency pitch, channels together. Real-time mode is not what an
 * offline render would pick on quality alone — it is what the preview runs,
 * and matching the preview is the point.
 */
export const RUBBER_BAND_OPTIONS = OPTION_PROCESS_REAL_TIME
  | OPTION_THREADING_NEVER
  | OPTION_PITCH_HIGH_CONSISTENCY
  | OPTION_CHANNELS_TOGETHER

const WASI_ENOSYS = 52

interface RubberBandExports {
  memory: WebAssembly.Memory
  _initialize: () => void
  wasm_malloc: (bytes: number) => number
  wasm_free: (pointer: number) => void
  rb_new: (sampleRate: number, channels: number, options: number, timeRatio: number, pitchScale: number) => number
  rb_delete: (state: number) => void
  rb_set_max_process_size: (state: number, frames: number) => void
  rb_get_preferred_start_pad: (state: number) => number
  rb_get_start_delay: (state: number) => number
  rb_get_samples_required: (state: number) => number
  rb_process: (state: number, input: number, frames: number, final: number) => void
  rb_available: (state: number) => number
  rb_retrieve: (state: number, output: number, frames: number) => number
}

export interface RubberBand {
  exports: RubberBandExports
  /** Views over the wasm heap, replaced whenever the heap grows. */
  heap: { f32: Float32Array, u32: Uint32Array }
}

export interface StretchParameters {
  /** Output length over input length; above one is slower. */
  timeRatio: number
  /** Frequency multiplier. */
  pitchScale: number
}

/** Instantiates the wasm the way the worklet does: no WASI, and a heap view refreshed on growth. */
export async function loadRubberBand(bytes: Uint8Array): Promise<RubberBand> {
  const heap = { f32: new Float32Array(0), u32: new Uint32Array(0) }
  // Filled in once the instance exists; growth can only be notified after that.
  const wasm: { exports?: RubberBandExports } = {}
  const refresh = () => {
    heap.f32 = new Float32Array(wasm.exports!.memory.buffer)
    heap.u32 = new Uint32Array(wasm.exports!.memory.buffer)
  }
  const unsupported = () => WASI_ENOSYS
  const module = await WebAssembly.compile(bytes as Uint8Array<ArrayBuffer>)
  const instance = await WebAssembly.instantiate(module, {
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
  const exports = instance.exports as unknown as RubberBandExports
  wasm.exports = exports
  refresh()
  exports._initialize()
  return { exports, heap }
}

/**
 * Stretches every channel together and returns the result, roughly
 * `timeRatio` times as long. The first output frame lines up with the first
 * input frame: the start pad goes in as silence and the start delay comes out
 * and is dropped, exactly as the worklet does on every seek.
 */
export function stretch(
  rubberBand: RubberBand,
  channels: Float32Array[],
  sampleRate: number,
  { timeRatio, pitchScale }: StretchParameters,
): Float32Array[] {
  const { exports: wasm, heap } = rubberBand
  const channelCount = channels.length
  const length = channels[0]?.length ?? 0

  const inPtrArray = wasm.wasm_malloc(channelCount * 4)
  const outPtrArray = wasm.wasm_malloc(channelCount * 4)
  const inPtrs: number[] = []
  const outPtrs: number[] = []
  for (let ch = 0; ch < channelCount; ch++) {
    inPtrs.push(wasm.wasm_malloc(CHUNK * 4))
    outPtrs.push(wasm.wasm_malloc(CHUNK * 4))
  }
  // Written after every malloc, so a heap that grew mid-allocation cannot stale them.
  for (let ch = 0; ch < channelCount; ch++) {
    heap.u32[(inPtrArray >> 2) + ch] = inPtrs[ch]!
    heap.u32[(outPtrArray >> 2) + ch] = outPtrs[ch]!
  }

  const state = wasm.rb_new(sampleRate, channelCount, RUBBER_BAND_OPTIONS, timeRatio, pitchScale)
  const capacity = Math.ceil(length * timeRatio) + CHUNK
  const output = Array.from({ length: channelCount }, () => new Float32Array(capacity))
  let written = 0
  let discard = 0

  try {
    wasm.rb_set_max_process_size(state, CHUNK)
    discard = wasm.rb_get_start_delay(state)

    const drain = () => {
      for (;;) {
        const available = wasm.rb_available(state)
        if (available <= 0) return
        const got = wasm.rb_retrieve(state, outPtrArray, Math.min(available, CHUNK))
        if (got <= 0) return
        const skip = Math.min(discard, got)
        discard -= skip
        const keep = Math.min(got - skip, capacity - written)
        for (let ch = 0; ch < channelCount; ch++) {
          const start = (outPtrs[ch]! >> 2) + skip
          output[ch]!.set(heap.f32.subarray(start, start + keep), written)
        }
        written += keep
      }
    }

    let pad = wasm.rb_get_preferred_start_pad(state)
    while (pad > 0) {
      const n = Math.min(pad, CHUNK)
      for (let ch = 0; ch < channelCount; ch++) heap.f32.fill(0, inPtrs[ch]! >> 2, (inPtrs[ch]! >> 2) + n)
      wasm.rb_process(state, inPtrArray, n, 0)
      pad -= n
      drain()
    }

    let read = 0
    do {
      const required = Math.max(wasm.rb_get_samples_required(state), BLOCK)
      const n = Math.min(length - read, CHUNK, required)
      for (let ch = 0; ch < channelCount; ch++) {
        heap.f32.set(channels[ch]!.subarray(read, read + n), inPtrs[ch]! >> 2)
      }
      read += n
      wasm.rb_process(state, inPtrArray, n, read >= length ? 1 : 0)
      drain()
    } while (read < length)

    // Everything still inside the stretcher once the final block is in.
    drain()
  }
  finally {
    wasm.rb_delete(state)
    for (const ptr of [...inPtrs, ...outPtrs, inPtrArray, outPtrArray]) wasm.wasm_free(ptr)
  }

  return output.map(channel => channel.subarray(0, written))
}
