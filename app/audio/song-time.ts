/**
 * Song time is the position within the Backing Track as recorded, which is
 * what the seek bar, the clock, and later the Lyrics screen show. Wall time
 * is what the listener's clock measures. Tempo is the exchange rate.
 */

/** The song time reached after `wallMs` of playback from `startSongMs` at `tempoPercent`. */
export function songTimeAfter(startSongMs: number, wallMs: number, tempoPercent: number): number {
  return startSongMs + wallMs * (tempoPercent / 100)
}

/**
 * Where a position within a Take's clip sits on the Backing Track's own
 * timeline. A Take is a short clip cut out of a long song, so the Review
 * screen is really watching two clocks: the clip's own, from zero, and the
 * song's, from wherever the singer started (ticket 15).
 */
export function takeSongPosition(startPositionMs: number, vocalElapsedMs: number): number {
  return startPositionMs + vocalElapsedMs
}

/**
 * The reverse: how far into a Take's clip a song position lands, clamped to
 * the clip's own span. The Backing Track runs on before and after a Take, but
 * the Review screen only ever plays the Take, so a song position outside it
 * resolves to the nearest end of the clip rather than to nothing.
 */
export function takeElapsedAt(startPositionMs: number, songPositionMs: number, takeDurationMs: number): number {
  return Math.max(0, Math.min(songPositionMs - startPositionMs, takeDurationMs))
}
