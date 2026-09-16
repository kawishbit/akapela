/**
 * Stretches one Backing Track for a Mix render and exits.
 *
 * `renderMix` in `../audio.ts` spawns this as its own `node` subprocess, the
 * way the separate Job spawns `separate-cli.ts`: Rubber Band over a whole song
 * is seconds to minutes of CPU, and the Job runner shares its process with
 * every API request. Run in process it would stall them all for the length
 * of the render.
 *
 * Runnable directly by Node (no bundler, no `tsx`) because Node 24 strips
 * TypeScript types natively — which is why every relative import here needs
 * an explicit extension.
 *
 * The output is 32-bit float WAV rather than the 16-bit the rest of the app
 * stores: it is an intermediate ffmpeg reads straight back in, and a pitch
 * shift can overshoot full scale, which float carries and 16-bit would clip.
 *
 * Usage: `node stretch-cli.ts <rubberband.wasm> <in.wav> <out.wav> <timeRatio> <pitchScale>`
 */
import { readFile, writeFile } from 'node:fs/promises'
import { decodeWav } from '../../../app/audio/wav.ts'
import { loadRubberBand, stretch } from './rubberband.ts'

const FLOAT_WAV_HEADER_BYTES = 44

/** Interleaves channels into an IEEE-float WAV (format 3), which ffmpeg reads natively. */
function encodeFloatWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const channelCount = channels.length
  const frames = channels[0]?.length ?? 0
  const blockAlign = channelCount * 4
  const dataBytes = frames * blockAlign
  const bytes = new Uint8Array(FLOAT_WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 3, true) // IEEE float
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 32, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  const samples = new Float32Array(bytes.buffer, FLOAT_WAV_HEADER_BYTES, frames * channelCount)
  for (let frame = 0; frame < frames; frame++) {
    for (let ch = 0; ch < channelCount; ch++) samples[frame * channelCount + ch] = channels[ch]![frame]!
  }
  return bytes
}

async function main(): Promise<void> {
  const [wasmPath, inPath, outPath, timeRatioArg, pitchScaleArg] = process.argv.slice(2)
  const timeRatio = Number(timeRatioArg)
  const pitchScale = Number(pitchScaleArg)
  if (!wasmPath || !inPath || !outPath || !(timeRatio > 0) || !(pitchScale > 0)) {
    console.error('usage: stretch-cli.ts <rubberband.wasm> <in.wav> <out.wav> <timeRatio> <pitchScale>')
    process.exit(1)
  }

  const rubberBand = await loadRubberBand(await readFile(wasmPath))
  const { channels, sampleRate } = decodeWav(await readFile(inPath))
  const stretched = stretch(rubberBand, channels, sampleRate, { timeRatio, pitchScale })
  await writeFile(outPath, encodeFloatWav(stretched, sampleRate))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
