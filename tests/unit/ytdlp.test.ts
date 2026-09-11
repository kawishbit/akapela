import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadYtDlp, ensureManagedYtDlp, ensureYtDlp, ytDlpAssetName, YtDlpDownloadError } from '../../server/lib/ytdlp'

let dir: string
let dest: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'akapela-ytdlp-test-'))
  dest = join(dir, 'cache', 'bin', 'yt-dlp')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

function serving(bytes: Uint8Array, status = 200): typeof fetch {
  return vi.fn(async () => new Response(bytes, { status })) as unknown as typeof fetch
}

describe('ytDlpAssetName', () => {
  it.each([
    ['win32', 'x64', 'yt-dlp.exe'],
    ['win32', 'ia32', 'yt-dlp_x86.exe'],
    ['darwin', 'arm64', 'yt-dlp_macos'],
    ['darwin', 'x64', 'yt-dlp_macos'],
    ['linux', 'x64', 'yt-dlp_linux'],
    ['linux', 'arm64', 'yt-dlp_linux_aarch64'],
  ])('%s/%s gets %s', (platform, arch, expected) => {
    // Every one of these is a standalone PyInstaller build. The plain `yt-dlp`
    // asset is a Python zipapp that needs a python3 nobody's laptop has.
    expect(ytDlpAssetName(platform as NodeJS.Platform, arch)).toBe(expected)
  })

  it('refuses a platform there is no build for', () => {
    expect(() => ytDlpAssetName('aix', 'ppc64')).toThrow(YtDlpDownloadError)
  })
})

describe('downloadYtDlp', () => {
  it('writes the binary and creates the cache directory on the way', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])

    await downloadYtDlp(dest, { platform: 'linux', arch: 'x64', fetchImpl: serving(bytes) })

    expect(readFileSync(dest)).toEqual(Buffer.from(bytes))
  })

  it('leaves no partial file behind on a failed write', async () => {
    await expect(
      downloadYtDlp(dest, { platform: 'linux', arch: 'x64', fetchImpl: serving(new Uint8Array(), 404) }),
    ).rejects.toThrow(YtDlpDownloadError)

    expect(existsSync(dest)).toBe(false)
    expect(existsSync(`${dest}.part`)).toBe(false)
  })

  it('names yt-dlp and the network when the fetch itself fails', async () => {
    const offline = vi.fn(async () => { throw new Error('Temporary failure in name resolution') }) as unknown as typeof fetch

    await expect(downloadYtDlp(dest, { platform: 'linux', arch: 'x64', fetchImpl: offline }))
      .rejects.toThrow(/yt-dlp.*network/s)
  })

  it('replaces a binary that is already there, which is what the update button is', async () => {
    await downloadYtDlp(dest, { platform: 'linux', arch: 'x64', fetchImpl: serving(new Uint8Array([1])) })
    await downloadYtDlp(dest, { platform: 'linux', arch: 'x64', fetchImpl: serving(new Uint8Array([2, 2])) })

    expect(readFileSync(dest)).toEqual(Buffer.from([2, 2]))
  })
})

describe('ensureYtDlp', () => {
  it('downloads when there is nothing there', async () => {
    const fetchImpl = serving(new Uint8Array([1]))

    await ensureYtDlp(dest, { platform: 'linux', arch: 'x64', fetchImpl })

    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('does nothing when the binary is already cached', async () => {
    writeFileSync(join(dir, 'yt-dlp'), 'already here')
    const fetchImpl = vi.fn() as unknown as typeof fetch

    // The first YouTube import on a machine pays for the download; none after
    // it does — the same bargain the separation model makes.
    await ensureYtDlp(join(dir, 'yt-dlp'), { platform: 'linux', arch: 'x64', fetchImpl })

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('ensureManagedYtDlp', () => {
  it('does nothing under compose, where the image bakes yt-dlp in', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    await ensureManagedYtDlp()

    expect(fetchImpl).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does nothing when an override is set but the app does not own the binary', async () => {
    vi.stubEnv('AKAPELA_YTDLP', dest)
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    await ensureManagedYtDlp()

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(existsSync(dest)).toBe(false)
    vi.unstubAllGlobals()
  })

  it('fetches into the app-owned path when the desktop shell says it owns it', async () => {
    vi.stubEnv('AKAPELA_YTDLP', dest)
    vi.stubEnv('AKAPELA_MANAGE_YTDLP', '1')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([7]), { status: 200 })))

    await ensureManagedYtDlp()

    expect(readFileSync(dest)).toEqual(Buffer.from([7]))
    vi.unstubAllGlobals()
  })
})
