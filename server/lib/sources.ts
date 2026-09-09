import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { COVER_BASENAME, coverExtension } from './cover'

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
 */
function jsRuntimeArgs(): string[] {
  return ['--js-runtimes', 'node']
}

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args)
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
    const child = spawn('yt-dlp', args)
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

/** yt-dlp prefixes its messages with `ERROR:`; the card already says the import failed. */
function cleanYtDlpMessage(stderr: string, exitCode: number | null): string {
  const cleaned = stderr
    .trim()
    .replace(/^(ERROR|WARNING):\s*/, '')
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
