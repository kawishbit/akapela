import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { AUDIO_FORMATS, type AudioFormat } from '../../shared/audio-format'

/**
 * Where a Track's stored audio is, whatever Audio Format it was written in
 * (ADR 0016). The Backing Track master and each Stem have a fixed basename in
 * the Track directory — `backing`, `instrumental`, `vocals` — and an extension
 * that says which format that one file is. Nothing assumes `.wav`: a library
 * whose format changed halfway holds both, and each file is read as what it
 * is.
 */

export const BACKING_BASENAME = 'backing'
export const INSTRUMENTAL_BASENAME = 'instrumental'
export const VOCALS_BASENAME = 'vocals'

export function audioFileName(basename: string, format: AudioFormat): string {
  return `${basename}.${format}`
}

/** Every file under `directory` named `basename` in any Audio Format, whether or not it exists. */
export function audioFileCandidates(directory: string, basename: string): string[] {
  return AUDIO_FORMATS.map(format => join(directory, audioFileName(basename, format)))
}

/**
 * The file named `basename` under `directory`, in whichever format it was
 * written, or null when there is none. A writer never leaves two behind
 * (`replaceAudioFile`), so the order they are tried in only matters to a
 * directory someone assembled by hand.
 */
export function findAudioFile(directory: string, basename: string): string | null {
  return audioFileCandidates(directory, basename).find(path => existsSync(path)) ?? null
}

/** The Audio Format a stored file is in, from its extension, or null for anything else. */
export function audioFormatOf(path: string): AudioFormat | null {
  const extension = extname(path).slice(1).toLowerCase()
  return (AUDIO_FORMATS as readonly string[]).includes(extension) ? extension as AudioFormat : null
}

const CONTENT_TYPES: Record<AudioFormat, string> = {
  wav: 'audio/wav',
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
}

/** What a stored audio file is served as, so the browser decodes it as what it is. */
export function audioContentType(path: string): string {
  const format = audioFormatOf(path)
  return format ? CONTENT_TYPES[format] : 'application/octet-stream'
}
