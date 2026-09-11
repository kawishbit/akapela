import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { COVER_BASENAME, coverExtension } from './cover'
import { childEnv, jsRuntimePath, ytDlpPath } from './tools'
import { ensureManagedYtDlp } from './ytdlp'

/**
 * Source fetchers: where a Track's audio and metadata come from. Ported from
 * `worker/akapela_worker/sources.py` (ticket 03 of `.scratch/worker-to-typescript/`).
 *
 * yt-dlp breaks whenever YouTube changes under it, so every call into it sits
 * behind `SourceFetcher`, the same guard the Python worker gave it. This is a
 * subprocess wrapper around the standalone yt-dlp binary rather than a Python
 * library dependency — yt-dlp ships one, per OS, and was never the reason this
 * had to be Python.
 */

export const ORIGINAL_BASENAME = 'original'
const THUMBNAIL_TIMEOUT_MS = 30_000

export class SourceError extends Error {}

export interface SourceMetadata {
  title: string
  durationMs: number | null
  /** Filename of the Source's artwork written into `directory`; null when it has none. */
  coverFile: string | null
}

/** Receives the fraction (0 to 1) of the audio downloaded so far. */
export type ProgressCallback = (fraction: number) => void

export interface SourceFetcher {
  fetchMetadata(url: string, directory: string): Promise<SourceMetadata>
  downloadAudio(url: string, directory: string, onProgress: ProgressCallback): Promise<string>
}

/** The real thing: the standalone yt-dlp binary, with its progress parsed off stdout. */
export class YtDlpFetcher implements SourceFetcher {
  async fetchMetadata(url: string, directory: string): Promise<SourceMetadata> {
    await mkdir(directory, { recursive: true })
    // Desktop only, and only the first time: the app owns its yt-dlp there and
    // fetches it when an import needs it. Inert everywhere else.
    await ensureManagedYtDlp()
    const stdout = await runYtDlp(['-J', '--no-playlist', ...jsRuntimeArgs(), url])

    let info: Record<string, unknown>
    try {
      info = JSON.parse(stdout)
    }
    catch {
      throw new SourceError(`yt-dlp found nothing at ${url}`)
    }
    if (!info) throw new SourceError(`yt-dlp found nothing at ${url}`)
    if (info._type === 'playlist' || 'entries' in info) {
      throw new SourceError(`${url} is a playlist, not a single video`)
    }

    const duration = typeof info.duration === 'number' ? info.duration : null
    return {
      title: typeof info.title === 'string' && info.title ? info.title : url,
      durationMs: duration === null ? null : Math.round(duration * 1000),
      coverFile: await downloadThumbnail(typeof info.thumbnail === 'string' ? info.thumbnail : null, directory),
    }
  }

  async downloadAudio(url: string, directory: string, onProgress: ProgressCallback): Promise<string> {
    await mkdir(directory, { recursive: true })
    await ensureManagedYtDlp()
    // A retry may have left a different-extension file behind than this attempt will produce.
    for (const stale of await originalFiles(directory)) await rm(join(directory, stale), { force: true })

    await runYtDlpWithProgress(
      ['-f', 'bestaudio/best', '-o', join(directory, `${ORIGINAL_BASENAME}.%(ext)s`), '--newline', ...jsRuntimeArgs(), url],
      onProgress,
    )

    const [written] = await originalFiles(directory)
    if (!written) throw new SourceError(`yt-dlp reported success but wrote no audio for ${url}`)
    return join(directory, written)
  }
}

async function originalFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory).catch(() => [] as string[])
  return entries.filter(name => name.startsWith(`${ORIGINAL_BASENAME}.`))
}

/**
 * YouTube's player challenges are solved by running JavaScript in an external
 * runtime. Node (22+) is what the image and dev machines have — the same
 * requirement the Python worker had, unrelated to this being Python.
 *
 * A singer who downloaded the desktop installer has no Node on their PATH, and
 * without a runtime YouTube now refuses most formats rather than merely
 * offering fewer — so the desktop shell sets `AKAPELA_JS_RUNTIME` to
 * Electron's own binary and this hands yt-dlp that path outright.
 * `--js-runtimes node:<path>` takes either a directory or the binary itself;
 * yt-dlp then runs it as `node`, which it is, because `childEnv` puts
 * `ELECTRON_RUN_AS_NODE=1` in the environment yt-dlp passes down to it. No
 * fourth binary ships for this, and nothing changes for compose, `pnpm dev`,
 * or `aspire run`, which all have a real Node and set no override.
 */
function jsRuntimeArgs(): string[] {
  const runtime = jsRuntimePath()
  return ['--js-runtimes', runtime ? `node:${runtime}` : 'node']
}

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath(), args, { env: childEnv() })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => (stdout += d))
    child.stderr.on('data', d => (stderr += d))
    child.on('error', error => reject(new SourceError(`could not start yt-dlp: ${error.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new SourceError(cleanYtDlpMessage(stderr, code)))
    })
  })
}

const PROGRESS_LINE = /\[download]\s+([\d.]+)%/

function runYtDlpWithProgress(args: string[], onProgress: ProgressCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath(), args, { env: childEnv() })
    let stderr = ''
    let buffered = ''

    child.stdout.on('data', (chunk: Buffer) => {
      buffered += chunk.toString()
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        const match = PROGRESS_LINE.exec(line)
        if (match) onProgress(Math.max(0, Math.min(1, Number(match[1]) / 100)))
      }
    })
    child.stderr.on('data', d => (stderr += d))
    child.on('error', error => reject(new SourceError(`could not start yt-dlp: ${error.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new SourceError(cleanYtDlpMessage(stderr, code)))
    })
  })
}

/**
 * What yt-dlp says when the JavaScript runtime it needs is missing or will not
 * run. Generic on its own — "no supported JS runtime" means nothing to a
 * singer — so it is named for what it is, and for which of the two situations
 * they are in.
 */
const MISSING_JS_RUNTIME = /js\s*runtime|jsruntime|--js-runtimes/i

function jsRuntimeAdvice(): string {
  return jsRuntimePath()
    ? 'Akapela could not run the JavaScript YouTube needs to hand over a video. '
      + 'Try Update yt-dlp in Settings; if that does not help, this is worth reporting.'
    : 'YouTube needs a JavaScript runtime to hand over a video, and there is no `node` on this machine\'s PATH. '
      + 'Install Node 22 or newer (https://nodejs.org), or import the file instead.'
}

/** yt-dlp prefixes its messages with `ERROR:`; the card already says the import failed. */
function cleanYtDlpMessage(stderr: string, exitCode: number | null): string {
  const cleaned = stderr
    .trim()
    .replace(/^(ERROR|WARNING):\s*/, '')
  if (MISSING_JS_RUNTIME.test(cleaned)) return `${jsRuntimeAdvice()}\n\n${cleaned}`
  return cleaned || `yt-dlp failed without a message (exit code ${exitCode})`
}

/** Saves the Source's artwork as `cover.<ext>`. Artwork is optional, so failures only log. */
async function downloadThumbnail(url: string | null, directory: string): Promise<string | null> {
  if (!url) return null
  let response: Response
  try {
    response = await fetch(url, {
      headers: { 'user-agent': 'Akapela' },
      signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS),
    })
  }
  catch (error) {
    console.warn(`could not fetch thumbnail ${url}: ${error instanceof Error ? error.message : error}`)
    return null
  }
  if (!response.ok) {
    console.warn(`could not fetch thumbnail ${url}: HTTP ${response.status}`)
    return null
  }
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const ext = coverExtension(contentType, url)
  if (!ext) {
    console.warn(`thumbnail ${url} has unsupported type ${JSON.stringify(contentType)}`)
    return null
  }
  const filename = `${COVER_BASENAME}.${ext}`
  const bytes = new Uint8Array(await response.arrayBuffer())
  const { writeFile, rename } = await import('node:fs/promises')
  const partial = join(directory, `${COVER_BASENAME}.part`)
  await writeFile(partial, bytes)
  await rename(partial, join(directory, filename))
  // A retry may fetch artwork of a different type than the attempt before it.
  for (const name of await readdir(directory)) {
    if (name.startsWith(`${COVER_BASENAME}.`) && name !== filename) await rm(join(directory, name), { force: true })
  }
  return filename
}
