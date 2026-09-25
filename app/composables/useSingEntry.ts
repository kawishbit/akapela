import type { QueueEntryWithTrack } from '~~/server/lib/queue'

/** Where singing a Queue Entry goes: its Track's Sing screen, carrying the entry so the turn uses it up. */
export function entrySingPath(entry: Pick<QueueEntryWithTrack, 'id' | 'trackId'>): string {
  return `/tracks/${entry.trackId}/sing?entry=${encodeURIComponent(entry.id)}`
}

/**
 * Singing a Queue Entry, from the Queue page or from Up next. One way in, so
 * both behave the same.
 */
export function useSingEntry() {
  function sing(entry: QueueEntryWithTrack) {
    return navigateTo(entrySingPath(entry))
  }
  return { sing }
}
