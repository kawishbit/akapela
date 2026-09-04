import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, desc, eq, sql } from 'drizzle-orm'
import { takes, type Take } from '../db/schema'
import type { TakeReviewUpdate, TakeUploadMeta } from '../../shared/take'
import type { Presto } from './presto'
import { trackDir } from './tracks'

/** Takes live under `takes/` inside their Track's directory (ADR 0006), one WAV per Take. */
const TAKES_DIRNAME = 'takes'

/** Every Take of a Track, newest first. */
export function listTakes(presto: Presto, trackId: string): Take[] {
  return presto.db
    .select()
    .from(takes)
    .where(eq(takes.trackId, trackId))
    .orderBy(desc(takes.createdAt), desc(sql`${takes}.rowid`))
    .all()
}

/**
 * Writes an uploaded Take's WAV into the Track's directory and inserts its
 * row. Latency nudge and gains start at no correction; the Review screen
 * (ticket 08) is what lets the singer change them.
 */
export function createTake(
  presto: Presto,
  trackId: string,
  input: TakeUploadMeta & { bytes: Uint8Array },
): Take {
  const id = randomUUID()
  const filePath = `${TAKES_DIRNAME}/${id}.wav`
  const dir = join(trackDir(presto, trackId), TAKES_DIRNAME)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(trackDir(presto, trackId), filePath), input.bytes)

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
  presto.db.insert(takes).values(take).run()
  return take
}

/** One Take of a Track by id, or undefined when there is none — including a Take id from another Track. */
export function getTake(presto: Presto, trackId: string, takeId: string): Take | undefined {
  return presto.db
    .select()
    .from(takes)
    .where(and(eq(takes.trackId, trackId), eq(takes.id, takeId)))
    .get()
}

/** Saves what the Review screen (ticket 08) lets a singer change on a Take: latency nudge, the gain pair, and Adjustments. */
export function updateTakeReview(presto: Presto, take: Take, input: TakeReviewUpdate): Take {
  const now = Date.now()
  presto.db
    .update(takes)
    .set({ ...input, updatedAt: now })
    .where(eq(takes.id, take.id))
    .run()
  return { ...take, ...input, updatedAt: now }
}

/** Deletes a Take's row and its WAV file. Returns false when no such Take exists on that Track. */
export function deleteTake(presto: Presto, trackId: string, takeId: string): boolean {
  const removed = presto.db
    .delete(takes)
    .where(and(eq(takes.trackId, trackId), eq(takes.id, takeId)))
    .returning({ filePath: takes.filePath })
    .all()
  if (removed.length === 0) return false
  rmSync(join(trackDir(presto, trackId), removed[0]!.filePath), { force: true })
  return true
}
