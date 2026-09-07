import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, desc, eq, sql } from 'drizzle-orm'
import { mixes, takes, type Take } from '../db/schema'
import { parseAdjustments } from '../../shared/adjustments'
import type { TakeReviewUpdate, TakeUploadMeta } from '../../shared/take'
import type { Akapela } from './akapela'
import { trackDir } from './tracks'

/** Takes live under `takes/` inside their Track's directory (ADR 0006), one WAV per Take. */
const TAKES_DIRNAME = 'takes'

/** Same gap as `tracks.ts`'s `withParsedAdjustments`, for a Take's own `adjustments` column. */
function withParsedAdjustments(take: Take): Take {
  return { ...take, adjustments: parseAdjustments(take.adjustments) }
}

/** Every Take of a Track, newest first. */
export function listTakes(akapela: Akapela, trackId: string): Take[] {
  return akapela.db
    .select()
    .from(takes)
    .where(eq(takes.trackId, trackId))
    .orderBy(desc(takes.createdAt), desc(sql`${takes}.rowid`))
    .all()
    .map(withParsedAdjustments)
}

/**
 * Writes an uploaded Take's WAV into the Track's directory and inserts its
 * row. Latency nudge and gains start at no correction; the Review screen
 * (ticket 08) is what lets the singer change them.
 */
export function createTake(
  akapela: Akapela,
  trackId: string,
  input: TakeUploadMeta & { bytes: Uint8Array },
): Take {
  const id = randomUUID()
  const filePath = `${TAKES_DIRNAME}/${id}.wav`
  const dir = join(trackDir(akapela, trackId), TAKES_DIRNAME)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(trackDir(akapela, trackId), filePath), input.bytes)

  const now = Date.now()
  const take: Take = {
    id,
    trackId,
    startPositionMs: input.startPositionMs,
    durationMs: input.durationMs,
    filePath,
    adjustments: input.adjustments,
    latencyNudgeMs: 0,
    vocalGain: 1,
    backingGain: 1,
    createdAt: now,
    updatedAt: now,
  }
  akapela.db.insert(takes).values(take).run()
  return take
}

/** One Take of a Track by id, or undefined when there is none — including a Take id from another Track. */
export function getTake(akapela: Akapela, trackId: string, takeId: string): Take | undefined {
  const row = akapela.db
    .select()
    .from(takes)
    .where(and(eq(takes.trackId, trackId), eq(takes.id, takeId)))
    .get()
  return row && withParsedAdjustments(row)
}

/** Saves what the Review screen (ticket 08) lets a singer change on a Take: latency nudge, the gain pair, and Adjustments. */
export function updateTakeReview(akapela: Akapela, take: Take, input: TakeReviewUpdate): Take {
  const now = Date.now()
  akapela.db
    .update(takes)
    .set({ ...input, updatedAt: now })
    .where(eq(takes.id, take.id))
    .run()
  return { ...take, ...input, updatedAt: now }
}

/**
 * Deletes a Take's row and its WAV file, and every Mix rendered from it.
 * The `mixes` table cascades on the Take's row (`server/db/schema.ts`), but a
 * cascade only removes rows — their MP3 and WAV files are reclaimed here,
 * read out before the delete takes the rows (and the join to reach them) away.
 */
export function deleteTake(akapela: Akapela, trackId: string, takeId: string): boolean {
  const dir = trackDir(akapela, trackId)
  const orphanedMixFiles = akapela.db
    .select({ mp3Path: mixes.mp3Path, wavPath: mixes.wavPath })
    .from(mixes)
    .where(eq(mixes.takeId, takeId))
    .all()

  const removed = akapela.db
    .delete(takes)
    .where(and(eq(takes.trackId, trackId), eq(takes.id, takeId)))
    .returning({ filePath: takes.filePath })
    .all()
  if (removed.length === 0) return false
  rmSync(join(dir, removed[0]!.filePath), { force: true })
  for (const { mp3Path, wavPath } of orphanedMixFiles) {
    if (mp3Path) rmSync(join(dir, mp3Path), { force: true })
    if (wavPath) rmSync(join(dir, wavPath), { force: true })
  }
  return true
}
