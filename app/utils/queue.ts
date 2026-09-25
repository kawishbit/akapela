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
