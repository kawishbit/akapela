import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { DEFAULT_AUDIO_FORMAT, type AudioFormat } from '../../../shared/audio-format'

/**
 * What every Job handler that touches a Track's own directory shares:
 * where it is, and the guard against the singer deleting the Track while a
 * Job that writes into it is still running. Job handlers only ever have
 * `ctx.dataDir` (a string), not the full `Akapela` handle `server/lib/tracks.ts`
 * builds its own `trackDir` from — this is that same path, built from what a
 * handler actually has.
 */

export function trackDir(dataDir: string, trackId: string): string {
  return join(dataDir, 'tracks', trackId)
}

/**
 * The Audio Format a file written now is stored in (ADR 0016), read when it is
 * written rather than when its Job was asked for: it changes how the file is
 * kept, never what it sounds like.
 */
export function audioFormatNow(sqlite: Database.Database): AudioFormat {
  const row = sqlite.prepare(`SELECT audio_format FROM settings WHERE id = 1`).get() as
    { audio_format: AudioFormat } | undefined
  return row?.audio_format ?? DEFAULT_AUDIO_FORMAT
}

export function trackExists(sqlite: Database.Database, trackId: string): boolean {
  return sqlite.prepare(`SELECT 1 FROM tracks WHERE id = ?`).get(trackId) !== undefined
}

/**
 * The singer may delete a Track while a Job that writes into it runs. The app
 * removes the row and the directory; anything written afterwards is an
 * orphan, so remove it and give up rather than resurrect the Track.
 */
export async function ensureNotDeleted(
  sqlite: Database.Database,
  trackId: string,
  directory: string,
  during: string,
): Promise<void> {
  if (trackExists(sqlite, trackId)) return
  await rm(directory, { recursive: true, force: true })
  throw new Error(`Track ${trackId} was deleted during ${during}`)
}
