import type { SeparationState } from '~~/server/db/schema'

/**
 * `list` with the item at `from` moved to `to`, clamped to the list the way
 * `moveQueueEntry` clamps on the server, so the order a drag shows is the
 * order the next poll brings back. A `from` outside the list changes nothing.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= next.length) return next
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item!)
  return next
}

/** What Up next says about an entry: "Sara — Creep", or just "Creep" when nobody gave a name. */
export function upNextLabel(entry: { singerName: string | null, track: { title: string } }): string {
  return entry.singerName ? `${entry.singerName} — ${entry.track.title}` : entry.track.title
}

/**
 * Whether an entry can go straight to its Sing screen. A Track never asked to
 * separate is as ready as it will be; one still separating, or whose
 * Separation failed, asks first whether to sing over the original audio.
 */
export function entryReadiness(entry: { track: { separationState: SeparationState } }): 'ready' | 'separating' | 'failed' {
  const state = entry.track.separationState
  return state === 'separating' || state === 'failed' ? state : 'ready'
}
