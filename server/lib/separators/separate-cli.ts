/**
 * Runs one separation and exits — the CPU-isolation boundary for the
 * separate Job (ticket 06 follow-up, `.scratch/worker-to-typescript/`).
 * `MdxNetSeparator.separate` in `../jobs/separate.ts` spawns this as a real
 * `node` subprocess (the same pattern this app already uses for ffmpeg and
 * yt-dlp) rather than running the ONNX inference on the main thread, so a
 * multi-minute separation never blocks the HTTP server the way it would in
 * process. A `worker_threads` version was considered first (ticket 02 built
 * the primitive for it) but needs a worker entry point that survives Nitro's
 * production bundling; a subprocess sidesteps that entirely by being a real,
 * independently-runnable file, the same way ffmpeg/yt-dlp already are.
 *
 * Runnable directly by Node (no bundler, no `tsx`) because Node 24 strips
 * TypeScript types natively — which is also why every relative import here,
 * and in every file it imports, needs an explicit extension: Node's ESM
 * resolver requires one, unlike Nitro/Vite's bundler.
 *
 * It starts by lowering its own priority, then opens the model with as many
 * threads as the core limit in force when the Separation started — both read
 * by the Job and passed in, never by this process (`cli-args.ts`).
 *
 * Usage: `node separate-cli.ts --model-name <Inst_Main> --model <model.onnx> --input <backing.wav>
 * --instrumental <out.wav> --vocals <out.wav> --threads <n>`
 */
import { readFile, writeFile } from 'node:fs/promises'
import { decodeWav, encodeWav } from '../../../app/audio/wav.ts'
import { parseSeparateCliArgs } from './cli-args.ts'
import { MdxNetModel } from './mdx-net.ts'
import { SEPARATION_MODELS } from './models.ts'
import { lowerOwnPriority } from './priority.ts'
import { formatChunkProgress, formatNotice } from './progress.ts'
import { createCpuSession } from './session.ts'

async function main(): Promise<void> {
  const priorityProblem = lowerOwnPriority()
  if (priorityProblem) process.stdout.write(formatNotice(priorityProblem))

  const args = parseSeparateCliArgs(process.argv.slice(2))
  if (typeof args === 'string') {
    console.error(`separate-cli.ts: ${args}`)
    process.exit(1)
  }

  const { channels, sampleRate } = decodeWav(await readFile(args.inputPath))
  const left = Float64Array.from(channels[0]!)
  const right = Float64Array.from(channels[1] ?? channels[0]!)

  const session = await createCpuSession(args.modelPath, args.threads)
  const model = new MdxNetModel(SEPARATION_MODELS[args.modelName].config, session)
  const { instrumental, vocals } = await model.separate([left, right], {
    onChunk: (done, total) => process.stdout.write(formatChunkProgress(done, total)),
  })

  await writeFile(args.instrumentalPath, encodeWav({
    channels: [Float32Array.from(instrumental[0]), Float32Array.from(instrumental[1])],
    sampleRate,
  }))
  await writeFile(args.vocalsPath, encodeWav({
    channels: [Float32Array.from(vocals[0]), Float32Array.from(vocals[1])],
    sampleRate,
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
