import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchModel, ModelDownloadError } from '../../../server/lib/separators/download-model'
import { SEPARATION_MODELS, type SeparationModel } from '../../../server/lib/separators/models'

const BYTES = new Uint8Array([1, 2, 3, 4])

/** A catalog entry whose hash is the one `BYTES` has, since the real models' are 50 MB files. */
const MODEL: SeparationModel = {
  ...SEPARATION_MODELS.Inst_HQ_3,
  partialMd5: createHash('md5').update(BYTES).digest('hex'),
}
const MODEL_FILENAME = MODEL.fileName

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'akapela-model-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('fetchModel', () => {
  it('downloads the model into the cache directory', async () => {
    const bytes = BYTES
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200 })))

    const path = await fetchModel(dir, MODEL)

    expect(path).toBe(join(dir, MODEL_FILENAME))
    expect(readFileSync(path)).toEqual(Buffer.from(bytes))
    expect(existsSync(join(dir, `${MODEL_FILENAME}.part`))).toBe(false)
  })

  it('does not re-download a model already on disk', async () => {
    writeFileSync(join(dir, MODEL_FILENAME), 'already downloaded')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const path = await fetchModel(dir, MODEL)

    expect(readFileSync(path, 'utf8')).toBe('already downloaded')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('names the model and the network on a failed download', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Temporary failure in name resolution')
    }))

    await expect(fetchModel(dir, MODEL)).rejects.toThrow(ModelDownloadError)
    await expect(fetchModel(dir, MODEL)).rejects.toThrow(MODEL_FILENAME)
    await expect(fetchModel(dir, MODEL)).rejects.toThrow(/network|resolution/)
  })

  it('fails on a non-OK response and leaves no partial file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))

    await expect(fetchModel(dir, MODEL)).rejects.toThrow(ModelDownloadError)
    expect(existsSync(join(dir, MODEL_FILENAME))).toBe(false)
    expect(existsSync(join(dir, `${MODEL_FILENAME}.part`))).toBe(false)
  })

  it('fetches the model it was asked for from the UVR repository', async () => {
    const fetchSpy = vi.fn(async () => new Response(BYTES, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    await fetchModel(dir, MODEL)

    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toMatch(/model_repo\/.*\/UVR-MDX-NET-Inst_HQ_3\.onnx$/)
  })

  it('refuses a file that is not the one the catalog names, and keeps nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([9, 9, 9]), { status: 200 })))

    await expect(fetchModel(dir, MODEL)).rejects.toThrow(/not the file Akapela expects/)
    expect(existsSync(join(dir, MODEL_FILENAME))).toBe(false)
    expect(existsSync(join(dir, `${MODEL_FILENAME}.part`))).toBe(false)
  })

  it('reports how much has arrived when the size is known', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(BYTES, { status: 200, headers: { 'content-length': '4' } })))
    const seen: number[] = []

    await fetchModel(dir, MODEL, { onProgress: fraction => seen.push(fraction) })

    expect(seen.at(-1)).toBe(1)
  })
})
