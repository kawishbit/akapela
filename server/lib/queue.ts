import { randomUUID } from 'node:crypto'
import type { ImportState, QueueEntry, SeparationState } from '../db/schema'
import type { Akapela } from './akapela'

/**
 * The Queue: one per install, shared by every device using it. Every change
 * to an entry's `position` happens inside a transaction here, so two phones
 * acting at once never leave the order half-applied — the worst they do is
 * last-write-wins, which the next poll corrects on the loser's screen.
 */

/** A Queue Entry with what its row renders, so the page never asks again per entry. */
export interface QueueEntryWithTrack extends QueueEntry {
  track: {
    id: string
    title: string
    artist: string | null
    /** For the cover URL's cache key, the way a Library card uses it. */
    updatedAt: number
    importState: ImportState
    separationState: SeparationState
    /** The running Separation's percentage, the number the Jobs page and the Library card show; null when none is running. */
    separationProgress: number | null
    separationJobId: string | null
  }
}

interface QueueRow {
  id: string
  track_id: string
  singer_name: string | null
  position: number
  created_at: number
  title: string
  artist: string | null
  updated_at: number
  import_state: ImportState
  separation_state: SeparationState
  separation_job_id: string | null
  separation_job_state: string | null
  separation_job_progress: number | null
}

const SELECT_ENTRIES = `
  SELECT q.id, q.track_id, q.singer_name, q.position, q.created_at,
    t.title, t.artist, t.updated_at, t.import_state, t.separation_state,
    j.id AS separation_job_id, j.state AS separation_job_state, j.progress AS separation_job_progress
  FROM queue_entries q
  JOIN tracks t ON t.id = q.track_id
  LEFT JOIN jobs j ON j.id = (
    SELECT id FROM jobs WHERE target_id = t.id AND type = 'separate'
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  )`

function toEntry(row: QueueRow): QueueEntryWithTrack {
  return {
    id: row.id,
    trackId: row.track_id,
    singerName: row.singer_name,
    position: row.position,
    createdAt: row.created_at,
    track: {
      id: row.track_id,
      title: row.title,
      artist: row.artist,
      updatedAt: row.updated_at,
      importState: row.import_state,
      separationState: row.separation_state,
      separationProgress: row.separation_state === 'separating' && row.separation_job_state === 'running'
        ? row.separation_job_progress
        : row.separation_state === 'separating' ? 0 : null,
      separationJobId: row.separation_job_id,
    },
  }
}

/** Every entry, first up first, in one query. */
export function listQueue(akapela: Akapela): QueueEntryWithTrack[] {
  const rows = akapela.sqlite.prepare(`${SELECT_ENTRIES} ORDER BY q.position, q.created_at`).all() as QueueRow[]
  return rows.map(toEntry)
}

export function getQueueEntry(akapela: Akapela, id: string): QueueEntryWithTrack | undefined {
  const row = akapela.sqlite.prepare(`${SELECT_ENTRIES} WHERE q.id = ?`).get(id) as QueueRow | undefined
  return row && toEntry(row)
}

/** A singer's name as typed, or null when nothing but spaces was. */
export function normalizeSingerName(name: string | null | undefined): string | null {
  const trimmed = name?.trim()
  return trimmed ? trimmed : null
}

/**
 * Appends an entry at the end of the Queue. "Last + 1" is read and written in
 * one transaction, so two devices adding at once never share a position.
 */
export function addToQueue(akapela: Akapela, input: { trackId: string, singerName?: string | null }): QueueEntryWithTrack {
  const id = randomUUID()
  akapela.sqlite.transaction(() => {
    const next = akapela.sqlite
      .prepare(`SELECT coalesce(max(position) + 1, 0) FROM queue_entries`)
      .pluck()
      .get() as number
    akapela.sqlite
      .prepare(`INSERT INTO queue_entries (id, track_id, singer_name, position, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, input.trackId, normalizeSingerName(input.singerName), next, Date.now())
  }).immediate()
  return getQueueEntry(akapela, id)!
}

/** Removes one entry. False when it was already gone. */
export function removeFromQueue(akapela: Akapela, id: string): boolean {
  return akapela.sqlite.transaction(() => {
    const removed = akapela.sqlite.prepare(`DELETE FROM queue_entries WHERE id = ?`).run(id).changes > 0
    if (removed) renumber(akapela, currentOrder(akapela))
    return removed
  }).immediate()
}

/** Entry ids, first up first. */
function currentOrder(akapela: Akapela): string[] {
  return akapela.sqlite
    .prepare(`SELECT id FROM queue_entries ORDER BY position, created_at`)
    .pluck()
    .all() as string[]
}

/** Writes `order` back as positions 0, 1, 2, … — call inside a transaction. */
function renumber(akapela: Akapela, order: readonly string[]): void {
  const set = akapela.sqlite.prepare(`UPDATE queue_entries SET position = ? WHERE id = ? AND position != ?`)
  order.forEach((id, index) => set.run(index, id, index))
}

/** Empties the Queue. Returns how many entries went. */
export function clearQueue(akapela: Akapela): number {
  return akapela.sqlite.prepare(`DELETE FROM queue_entries`).run().changes
}

/** How many entries name this Track, which the Library's delete confirm mentions. */
export function queueCountForTrack(akapela: Akapela, trackId: string): number {
  return akapela.sqlite.prepare(`SELECT count(*) FROM queue_entries WHERE track_id = ?`).pluck().get(trackId) as number
}
