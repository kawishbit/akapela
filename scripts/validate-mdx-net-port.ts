/**
 * Ticket 05 (`.scratch/worker-to-typescript/`): feeds the same audio clip
 * through the real Python/torch separation path and this TS port, and
 * compares the two Instrumental Stems by an objective measure — not run as
 * part of `pnpm test` (like the Python suite's own policy: the real model is
 * a network fetch and minutes of CPU, never run automatically). Run by hand:
 *
 *   node scripts/validate-mdx-net-port.ts <path-to-UVR-MDX-NET-Inst_HQ_3.onnx> <path-to-test-clip.wav> [reference-instrumental.wav]
 *
 * Run with `pnpm tsx scripts/validate-mdx-net-port.ts ...` — plain `node`
 * cannot resolve this repo's extensionless relative imports.
 *
 * Without a reference file, it prints this run's own fingerprint (RMS, first
 * samples) so it can be compared against a Python-side run by hand. With one
 * (produced by the real Python path on the same clip), it also reports a
 * sample-correlation coefficient between the two.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { decodeWav, encodeWav } from '../app/audio/wav'
import { MdxNetModel } from '../server/lib/separators/mdx-net'

async function main(): Promise<void> {
  const [modelPath, clipPath, referencePath] = process.argv.slice(2)
  if (!modelPath || !clipPath) {
    console.error('usage: validate-mdx-net-port.ts <model.onnx> <clip.wav> [reference-instrumental.wav]')
    process.exit(1)
  }

  const { channels, sampleRate } = decodeWav(readFileSync(clipPath))
  const left = Float64Array.from(channels[0]!)
  const right = Float64Array.from(channels[1] ?? channels[0]!)
  console.log(`clip: ${clipPath} (${sampleRate}Hz, ${left.length} samples, ${(left.length / sampleRate).toFixed(2)}s)`)

  const model = new MdxNetModel(modelPath)
  console.log('running TS separation pipeline...')
  const started = Date.now()
  const [outLeft, outRight] = await model.separateInstrumental([left, right])
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`)

  const outPath = clipPath.replace(/\.wav$/, '.ts-instrumental.wav')
  const bytes = encodeWav({ channels: [Float32Array.from(outLeft), Float32Array.from(outRight)], sampleRate })
  writeFileSync(outPath, bytes)
  console.log(`wrote ${outPath}`)

  console.log('--- TS output fingerprint ---')
  console.log(JSON.stringify(fingerprint(outLeft, outRight)))

  if (referencePath) {
    const reference = decodeWav(readFileSync(referencePath))
    const refLeft = Float64Array.from(reference.channels[0]!)
    const refRight = Float64Array.from(reference.channels[1] ?? reference.channels[0]!)
    console.log('--- reference fingerprint ---')
    console.log(JSON.stringify(fingerprint(refLeft, refRight)))
    console.log('--- comparison ---')
    console.log('left correlation:', correlation(outLeft, refLeft).toFixed(4))
    console.log('right correlation:', correlation(outRight, refRight).toFixed(4))
  }
}

function fingerprint(left: Float64Array, right: Float64Array): Record<string, unknown> {
  return {
    length: left.length,
    rms: rms(left, right),
    firstLeft: Array.from(left.slice(0, 10)),
    firstRight: Array.from(right.slice(0, 10)),
  }
}

function rms(left: Float64Array, right: Float64Array): number {
  let sumSquares = 0
  for (let i = 0; i < left.length; i++) sumSquares += left[i]! * left[i]! + right[i]! * right[i]!
  return Math.sqrt(sumSquares / (left.length * 2))
}

/** Pearson correlation, sample-for-sample. 1.0 is identical up to a linear scale; the metric ticket 05 needs. */
function correlation(a: Float64Array, b: Float64Array): number {
  const n = Math.min(a.length, b.length)
  let meanA = 0
  let meanB = 0
  for (let i = 0; i < n; i++) {
    meanA += a[i]!
    meanB += b[i]!
  }
  meanA /= n
  meanB /= n
  let num = 0
  let denomA = 0
  let denomB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i]! - meanA
    const db = b[i]! - meanB
    num += da * db
    denomA += da * da
    denomB += db * db
  }
  return num / Math.sqrt(denomA * denomB)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
