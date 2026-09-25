import type { QueueEntryWithTrack } from '~~/server/lib/queue'
import { entryReadiness } from '~/utils/queue'

/** Where singing a Queue Entry goes: its Track's Sing screen, carrying the entry so the turn uses it up. */
export function entrySingPath(entry: Pick<QueueEntryWithTrack, 'id' | 'trackId'>): string {
  return `/tracks/${entry.trackId}/sing?entry=${encodeURIComponent(entry.id)}`
}

/**
 * Singing a Queue Entry, from the Queue page or from Up next — one way in, so
 * both behave the same. A ready Track goes straight to its Sing screen. One
 * whose Separation is still running, or failed, asks first
 * (`SingChoiceDialog.vue`): sing over the original audio, or leave it for now.
 * The decision belongs where the room is looking, before anyone is on the
 * Sing screen.
 */
export function useSingEntry() {
  const choosing = useState<QueueEntryWithTrack | null>('akapela-sing-choice', () => null)

  function sing(entry: QueueEntryWithTrack) {
    if (entryReadiness(entry) !== 'ready') {
      choosing.value = entry
      return
    }
    return navigateTo(entrySingPath(entry))
  }

  return { sing, choosing }
}
