import { existsSync } from 'node:fs'
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { childEnv, ytDlpIsManaged, ytDlpPath } from './tools'

/**
 * The one thing the desktop app can do that the container cannot: replace its
 * own yt-dlp.
 *
 * yt-dlp is not like ffmpeg. It chases a site that changes without warning and
 * breaks every few months by design, and the README's answer —
 * `git pull && docker compose up -d --build` — only exists for someone who
 * cloned a repo. So on the desktop it is not bundled: it is fetched on first
 * use into `<dataDir>/cache/bin/`, the same shape as the separation model
 * (`separators/download-model.ts`), which means it survives app updates the
 * same way the model does, and can be replaced by a button in Settings
 * (ADR 0010).
 *
 * None of this runs under compose. There the image bakes yt-dlp in, no
 * override is set, `ytDlpIsManaged()` is false, and every function here is
 * inert.
 */

export class YtDlpDownloadError extends Error {}

const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
const VERSION_TIMEOUT_MS = 30_000

/**
 * The release asset for a platform.
 *
 * The plain `yt-dlp` asset is a Python zipapp that needs a `python3` on the
 * PATH, which a singer's laptop has no reason to carry — the same reason the
 * Dockerfile fetches `yt-dlp_linux` rather than `yt-dlp`. Every name here is a
 * standalone PyInstaller build that needs nothing installed.
 */
export function ytDlpAssetName(platform: NodeJS.Platform, arch: string): string {
  if (platform === 'win32') return arch === 'ia32' ? 'yt-dlp_x86.exe' : 'yt-dlp.exe'
  if (platform === 'darwin') return 'yt-dlp_macos'
  if (platform === 'linux') return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'
  throw new YtDlpDownloadError(`Akapela has no yt-dlp build for ${platform}.`)
}

export interface DownloadOptions {
  platform?: NodeJS.Platform
  arch?: string
  /** Injected by the suite; the real thing otherwise. */
  fetchImpl?: typeof fetch
}

/**
 * Downloads yt-dlp to `dest`, replacing whatever is there.
 *
 * Lands on a temporary name and is renamed into place only on success, so an
 * interrupted download never leaves half a binary that then fails in a way
 * nobody can read.
 */
export async function downloadYtDlp(dest: string, options: DownloadOptions = {}): Promise<void> {
  const {
    platform = process.platform,
    arch = process.arch,
    fetchImpl = fetch,
  } = options
  const asset = ytDlpAssetName(platform, arch)
  const url = `${RELEASE_BASE}/${asset}`

  await mkdir(dirname(dest), { recursive: true })
  let response: Response
  try {
    response = await fetchImpl(url)
  }
  catch (error) {
    throw new YtDlpDownloadError(
      'could not download yt-dlp, which Akapela fetches from the network the first time you import from '
      + `YouTube: ${error instanceof Error ? error.message : error}`,
    )
  }
  if (!response.ok) {
    throw new YtDlpDownloadError(`could not download yt-dlp: HTTP ${response.status} from ${url}`)
  }

  const tmp = `${dest}.part`
  try {
    await writeFile(tmp, new Uint8Array(await response.arrayBuffer()))
    // No effect on Windows, where executability is the extension's business.
    await chmod(tmp, 0o755)
  }
  catch (error) {
    await rm(tmp, { force: true })
    throw new YtDlpDownloadError(
      `could not download yt-dlp: ${error instanceof Error ? error.message : error}`,
    )
  }
  await rename(tmp, dest)
}

/** Downloads yt-dlp to `dest` if it is not already there. */
export async function ensureYtDlp(dest: string, options: DownloadOptions = {}): Promise<void> {
  if (existsSync(dest)) return
  await downloadYtDlp(dest, options)
}

/**
 * Makes sure the app-owned yt-dlp exists, when there is one.
 *
 * Called when a YouTube import needs it rather than at startup, so the first
 * import on a machine pays for the download and none after it does — the same
 * bargain the separation model makes.
 */
export async function ensureManagedYtDlp(): Promise<void> {
  if (!ytDlpIsManaged()) return
  await ensureYtDlp(ytDlpPath())
}

/** Re-downloads the app-owned yt-dlp and reports the version that landed. */
export async function updateManagedYtDlp(): Promise<string> {
  const dest = ytDlpPath()
  await downloadYtDlp(dest)
  return readYtDlpVersion(dest)
}

/** What `yt-dlp --version` says, or a placeholder when it will not answer. */
export function readYtDlpVersion(binary: string = ytDlpPath()): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], { env: childEnv() })
    let stdout = ''
    child.stdout.on('data', d => (stdout += d))
    child.on('error', () => resolve('unknown'))
    child.on('close', code => resolve(code === 0 && stdout.trim() ? stdout.trim() : 'unknown'))
    setTimeout(() => child.kill(), VERSION_TIMEOUT_MS).unref?.()
  })
}
