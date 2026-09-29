import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decodeWav } from '../../../app/audio/wav'
import { formatSeparateCliArgs } from '../../../server/lib/separators/cli-args'
import { parseAccelerator } from '../../../server/lib/separators/accelerator'
import { SEPARATION_MODELS } from '../../../server/lib/separators/models'

/**
 * The guard ADR 0008's amendment puts on every change to the separation
 * arithmetic: the Stems a fixed reference song separates into must correlate
 * at 0.999 or better, sample for sample, with the ones the code made before
 * the change. `tests/fixtures/separation/` holds the song — synthesized, so it
 * is ours to commit — and the Stems `Inst_Main` made from it on the CPU before
 * ticket 08 of `.scratch/faster-separation/` touched anything.
 *
 * It runs the real model through the real subprocess, so it needs the model:
 * it runs when `UVR-MDX-NET-Inst_Main.onnx` is in `AKAPELA_TEST_MODELS_DIR`,
 * or in `data/cache/models/`, where any local Separation leaves it, and skips
 * otherwise, since the suite never fetches it. `AKAPELA_TEST_ACCELERATOR`
 * (`dml:1`, `cuda`, `coreml`) runs it on a GPU backend too, which is how a
 * backend is held to the same rule.
 */

const FIXTURES = resolve('tests/fixtures/separation')
const MODEL = SEPARATION_MODELS.Inst_Main
const modelsDir = process.env.AKAPELA_TEST_MODELS_DIR ?? resolve('data/cache/models')
const modelPath = join(modelsDir, MODEL.fileName)
const haveModel = existsSync(modelPath)

const MIN_CORRELATION = 0.999

/** Pearson correlation, sample for sample. */
export function correlation(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let meanA = 0
  let meanB = 0
  for (let i = 0; i < n; i++) {
    meanA += a[i]!
    meanB += b[i]!
  }
  meanA /= n
  meanB /= n
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]! - meanA
    const y = b[i]! - meanB
    ab += x * y
    aa += x * x
    bb += y * y
  }
  return ab / Math.sqrt(aa * bb)
}

function ffmpeg(args: string[]): void {
  const result = spawnSync('ffmpeg', ['-y', '-nostdin', '-hide_banner', '-loglevel', 'error', ...args])
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`)
}

function readFlac(dir: string, name: string): Float32Array[] {
  const wav = join(dir, `${name}.decoded.wav`)
  ffmpeg(['-i', join(FIXTURES, `${name}.flac`), '-c:a', 'pcm_s16le', wav])
  return decodeWav(readFileSync(wav)).channels
}

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'akapela-reference-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function separate(label: string, accelerator?: string) {
  const input = join(dir, 'mix.wav')
  if (!existsSync(input)) ffmpeg(['-i', join(FIXTURES, 'reference-mix.flac'), '-c:a', 'pcm_s16le', input])
  const instrumentalPath = join(dir, `${label}-instrumental.wav`)
  const vocalsPath = join(dir, `${label}-vocals.wav`)
  const parsed = accelerator ? parseAccelerator(accelerator) : null
  const result = spawnSync(process.execPath, [
    resolve('server/lib/separators/separate-cli.ts'),
    ...formatSeparateCliArgs({
      modelName: MODEL.name,
      modelPath,
      inputPath: input,
      instrumentalPath,
      vocalsPath,
      threads: availableParallelism(),
      ...(parsed ? { accelerator: parsed } : {}),
    }),
  ], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`separate-cli failed: ${result.stderr}`)
  return {
    stdout: result.stdout,
    instrumental: decodeWav(readFileSync(instrumentalPath)).channels,
    vocals: decodeWav(readFileSync(vocalsPath)).channels,
  }
}

function expectCorrelated(stems: ReturnType<typeof separate>) {
  const reference = { instrumental: readFlac(dir, 'reference-instrumental'), vocals: readFlac(dir, 'reference-vocals') }
  for (const stem of ['instrumental', 'vocals'] as const) {
    for (const channel of [0, 1]) {
      const got = stems[stem][channel]!
      const want = reference[stem][channel]!
      expect(got.length, `${stem} length`).toBe(want.length)
      expect(correlation(got, want), `${stem} channel ${channel}`).toBeGreaterThanOrEqual(MIN_CORRELATION)
    }
  }
}

describe.skipIf(!haveModel)('the reference song, separated by Inst_Main', () => {
  it('correlates with the reference Stems on the CPU', () => {
    expectCorrelated(separate('cpu'))
  }, 300_000)

  it.skipIf(!process.env.AKAPELA_TEST_ACCELERATOR)('correlates with the reference Stems on the GPU backend named', () => {
    const stems = separate('gpu', process.env.AKAPELA_TEST_ACCELERATOR)
    expect(stems.stdout, 'the GPU should not have fallen back').not.toMatch(/^fallback /m)
    expectCorrelated(stems)
  }, 300_000)
})
