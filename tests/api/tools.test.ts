import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createTestApi, type TestApi } from './harness'

let api: TestApi
let dir: string

beforeEach(async () => {
  api = await createTestApi()
  dir = mkdtempSync(join(tmpdir(), 'akapela-tools-api-'))
})

afterEach(async () => {
  await api.close()
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/**
 * The test client talks to the in-process server over `fetch` too, so a blunt
 * stub would answer its own requests. This intercepts only the release
 * download and lets everything else through.
 */
function stubReleaseDownload(respond: () => Response): void {
  const real = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('yt-dlp/yt-dlp/releases')) return respond()
    return real(input, init)
  }))
}

describe('updating yt-dlp', () => {
  test('is refused where the binary is not the app\'s to replace', async () => {
    // Every compose instance: the image bakes yt-dlp in, and rebuilding the
    // image is still the answer there (ADR 0010).
    const res = await api.post('/api/tools/yt-dlp', {})

    expect(res.status).toBe(409)
  })

  test('downloads the latest release when the app owns its own copy', async () => {
    const dest = join(dir, 'yt-dlp')
    vi.stubEnv('AKAPELA_YTDLP', dest)
    vi.stubEnv('AKAPELA_MANAGE_YTDLP', '1')
    stubReleaseDownload(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))

    const res = await api.post('/api/tools/yt-dlp', {})

    expect(res.status).toBe(200)
    expect(existsSync(dest)).toBe(true)
    // The binary is a stub here, so it cannot answer `--version`; saying so is
    // the honest answer rather than inventing one.
    expect(await res.json()).toEqual({ version: 'unknown' })
  })

  test('reports a failed download rather than leaving a broken binary', async () => {
    const dest = join(dir, 'yt-dlp')
    vi.stubEnv('AKAPELA_YTDLP', dest)
    vi.stubEnv('AKAPELA_MANAGE_YTDLP', '1')
    stubReleaseDownload(() => new Response(null, { status: 503 }))

    const res = await api.post('/api/tools/yt-dlp', {})

    expect(res.status).toBe(502)
    expect(existsSync(dest)).toBe(false)
  })
})

describe('the Settings payload', () => {
  test('says yt-dlp is not updatable under compose', async () => {
    expect(await (await api.get('/api/settings')).json()).toMatchObject({ ytDlpUpdatable: false })
  })

  test('says it is on the desktop, which is what puts the control on the page', async () => {
    vi.stubEnv('AKAPELA_YTDLP', join(dir, 'yt-dlp'))
    vi.stubEnv('AKAPELA_MANAGE_YTDLP', '1')

    expect(await (await api.get('/api/settings')).json()).toMatchObject({ ytDlpUpdatable: true })
  })
})
