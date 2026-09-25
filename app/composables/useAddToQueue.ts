/** What the dialog needs of the Track being queued. */
export interface QueueableTrack {
  id: string
  title: string
}

/**
 * Asking "Who's singing?" and appending the entry, from anywhere: a Library
 * card, the Track page, the Queue page's own search. One dialog for the whole
 * app, mounted once in `app.vue`, so every way in behaves the same and the
 * header count moves the moment an entry lands. Nothing navigates — people
 * add several songs in a row.
 */
export function useAddToQueue() {
  const pending = useState<QueueableTrack | null>('akapela-add-to-queue', () => null)
  const confirmation = useState<string | null>('akapela-add-to-queue-confirmation', () => null)

  /** Opens the dialog for `track`. */
  function ask(track: QueueableTrack) {
    confirmation.value = null
    pending.value = track
  }

  function cancel() {
    pending.value = null
  }

  // Light enough for every Library card to call: the adding itself, and the
  // Queue it refreshes, belong to the one dialog (`AddToQueueDialog.vue`).
  return { pending, confirmation, ask, cancel }
}
