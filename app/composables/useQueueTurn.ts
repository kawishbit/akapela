import type { QueueEntryWithTrack } from '~~/server/lib/queue'

/** How the last visit to a Sing screen ended, which is what decides whether Up next is offered. */
export interface EndedTurn {
  trackId: string
  /** Whether a Take was recorded, so Review offers Up next rather than the Track page. */
  recorded: boolean
}

/**
 * A turn at singing a Queue Entry: the Sing screen opened with `?entry=`.
 *
 * The entry is only honoured when it is really in the Queue for this Track,
 * so a stale or bogus `entry=` is ignored and the screen behaves as a plain
 * Sing. It is removed exactly once, when this visit to the Sing screen ends —
 * a Take finished and they landed on Review, or they left by any route,
 * backing out without recording included — through the server, so every
 * other device sees it go. A reload or a closed tab gets there too, through a
 * `keepalive` request on `pagehide`.
 */
export function useQueueTurn(trackId: Ref<string>, entryId: Ref<string | null>) {
  const { entries, forget, refresh } = useQueue()
  const ended = useState<EndedTurn | null>('akapela-turn-ended', () => null)

  const entry = computed<QueueEntryWithTrack | null>(() => {
    if (!entryId.value) return null
    return entries.value.find(candidate => candidate.id === entryId.value && candidate.trackId === trackId.value) ?? null
  })

  // Remembered once seen, so the entry being consumed (and dropping out of
  // the list) does not make the name vanish from the screen mid-song.
  const current = ref<QueueEntryWithTrack | null>(null)
  watch(entry, (found) => { if (found) current.value = found }, { immediate: true })

  let consumed = false
  function consume() {
    const turn = current.value
    if (!turn || consumed) return
    consumed = true
    forget(turn.id)
    // `keepalive` lets the request outlive a page that is closing. A 404 means
    // another device took it out first, which is the same outcome. Read back
    // afterwards, so Up next offers whoever the server says is first now.
    fetch(`/api/queue/${turn.id}`, { method: 'DELETE', keepalive: true })
      .catch(() => {})
      .finally(() => void refresh())
  }

  onMounted(() => window.addEventListener('pagehide', consume))
  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', consume)
    consume()
  })

  /** Marks how this visit ended; the Review screen and the Track page read it to offer Up next. */
  function end(recorded: boolean) {
    ended.value = { trackId: trackId.value, recorded }
  }

  return { entry: current, end }
}
