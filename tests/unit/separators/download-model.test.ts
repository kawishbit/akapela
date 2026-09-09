import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchModel, ModelDownloadError, MODEL_FILENAME } from '../../../server/lib/separators/download-model'

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
    const bytes = new Uint8Array([1, 2, 3, 4])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200 })))

    const path = await fetchModel(dir)

    expect(path).toBe(join(dir, MODEL_FILENAME))
    expect(readFileSync(path)).toEqual(Buffer.from(bytes))
    expect(existsSync(join(dir, `${MODEL_FILENAME}.part`))).toBe(false)
  })

  it('does not re-download a model already on disk', async () => {
    writeFileSync(join(dir, MODEL_FILENAME), 'already downloaded')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const path = await fetchModel(dir)

    expect(readFileSync(path, 'utf8')).toBe('already downloaded')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('names the model and the network on a failed download', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Temporary failure in name resolution')
    }))

    await expect(fetchModel(dir)).rejects.toThrow(ModelDownloadError)
    await expect(fetchModel(dir)).rejects.toThrow(MODEL_FILENAME)
    await expect(fetchModel(dir)).rejects.toThrow(/network|resolution/)
  })

  it('fails on a non-OK response and leaves no partial file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))

    await expect(fetchModel(dir)).rejects.toThrow(ModelDownloadError)
    expect(existsSync(join(dir, MODEL_FILENAME))).toBe(false)
    expect(existsSync(join(dir, `${MODEL_FILENAME}.part`))).toBe(false)
  })
})
