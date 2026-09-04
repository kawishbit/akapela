/** Formats a duration in milliseconds as `m:ss`, or `h:mm:ss` from one hour up. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '--:--'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const minutesAndSeconds = `${hours ? String(minutes).padStart(2, '0') : minutes}:${String(seconds).padStart(2, '0')}`
  return hours ? `${hours}:${minutesAndSeconds}` : minutesAndSeconds
}

/** A pitch shift in semitones with its sign, to one decimal when it is not a whole semitone. */
export function formatPitch(semitones: number): string {
  const whole = Number.isInteger(semitones)
  const rounded = whole ? semitones : Number(semitones.toFixed(1))
  const text = whole ? String(Math.abs(rounded)) : Math.abs(rounded).toFixed(1)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  return `${sign}${text} st`
}

/** A Lyrics Offset in seconds with its sign, always to one decimal, since it moves in tenths. */
export function formatLyricsOffset(offsetMs: number): string {
  const seconds = offsetMs / 1000
  return `${offsetMs > 0 ? '+' : offsetMs < 0 ? '-' : ''}${Math.abs(seconds).toFixed(1)} s`
}

/** A tempo as a percentage of the original. */
export function formatTempo(percent: number): string {
  return `${percent}%`
}

/** The first line of a worker error, which is the human-readable summary before any traceback. */
export function errorSummary(error: string | null | undefined): string {
  if (!error) return 'Import failed'
  const firstLine = error.split('\n').find(line => line.trim()) ?? 'Import failed'
  // Worker errors read "ExceptionType: message"; the type name is noise to a singer.
  return firstLine.replace(/^[A-Za-z_][\w.]*(Error|Exception):\s*/, '').trim() || 'Import failed'
}

/** A one-line message for a failed request: the server's status message when it sent one. */
export function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const data = (error as { data?: { statusMessage?: string, message?: string } }).data
    if (data?.statusMessage) return data.statusMessage
    if (data?.message) return data.message
  }
  return error instanceof Error ? error.message : String(error)
}
