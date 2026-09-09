import { Worker } from 'node:worker_threads'

/**
 * Runs a genuinely CPU-bound step of a Job handler off the main thread, so it
 * never blocks the HTTP server the way it would running in process (ADR 0002's
 * replacement: this is the isolation the Python worker got for free by being a
 * second OS process). ffmpeg and yt-dlp already don't need this — they are
 * spawned subprocesses, and awaiting one never blocks the event loop — but the
 * vocal-separation model's ONNX inference (ticket 06) does real synchronous
 * work in this process, and that is what this exists for.
 *
 * `fn` is serialized with `Function.prototype.toString` and re-evaluated
 * inside the worker thread, so it must be self-contained: no closures over
 * anything outside its own body. Anything it needs from an npm package, it
 * must `require` itself, inside the function. This is a real constraint, not
 * an oversight — a worker thread shares no memory or module cache with this
 * process, so a function that could not be written this way could not run in
 * one regardless of how it got there. `eval: true` (a source string, not a
 * file path) is deliberate too: it works the same way whether this runs from
 * source or from Nitro's bundled `.output`, where a sibling file's path on
 * disk is not something this module can assume.
 */
export function runInWorkerThread<TInput, TOutput>(
  fn: (input: TInput, reportProgress: (percent: number) => void) => TOutput | Promise<TOutput>,
  input: TInput,
  onProgress?: (percent: number) => void,
): Promise<TOutput> {
  const source = `
    const { parentPort, workerData } = require('node:worker_threads')
    const fn = (${fn.toString()})
    Promise.resolve(fn(workerData, (percent) => parentPort.postMessage({ type: 'progress', percent })))
      .then((value) => parentPort.postMessage({ type: 'result', value }))
      .catch((error) => parentPort.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      }))
  `

  return new Promise<TOutput>((resolve, reject) => {
    const worker = new Worker(source, { eval: true, workerData: input })
    let settled = false

    worker.on('message', (message: { type: string, percent?: number, value?: TOutput, message?: string }) => {
      if (message.type === 'progress') {
        onProgress?.(message.percent!)
        return
      }
      settled = true
      if (message.type === 'result') resolve(message.value as TOutput)
      else reject(new Error(message.message))
      void worker.terminate()
    })
    worker.on('error', (error) => {
      settled = true
      reject(error)
    })
    worker.on('exit', (code) => {
      if (!settled && code !== 0) reject(new Error(`worker thread exited with code ${code} before finishing`))
    })
  })
}
