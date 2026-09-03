/**
 * Song time is the position within the Backing Track as recorded, which is
 * what the seek bar, the clock, and later the Lyrics screen show. Wall time
 * is what the listener's clock measures. Tempo is the exchange rate.
 */

/** The song time reached after `wallMs` of playback from `startSongMs` at `tempoPercent`. */
export function songTimeAfter(startSongMs: number, wallMs: number, tempoPercent: number): number {
  return startSongMs + wallMs * (tempoPercent / 100)
}
