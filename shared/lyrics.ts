/**
 * Lyrics: text attached to a Track, either Synced with a timestamp per line
 * or Plain with no timing. The parsing and the current-line arithmetic live
 * here because the API stores what a Lyrics Provider returned and the Sing
 * page reads it back; both sides work from the same shapes.
 */

export const LYRICS_PROVIDERS = ['lrclib', 'genius', 'manual'] as const
export type LyricsProviderName = (typeof LYRICS_PROVIDERS)[number]

/** How each Lyrics Provider is written where a singer reads it. */
export const LYRICS_PROVIDER_LABELS: Record<LyricsProviderName, string> = {
  lrclib: 'LRCLIB',
  genius: 'Genius',
  manual: 'Manual',
}

/** Where Lyrics come from until the singer says otherwise: the provider that needs no account. */
export const DEFAULT_LYRICS_PROVIDER: LyricsProviderName = 'lrclib'

export const INVALID_LYRICS_PROVIDER_MESSAGE
  = `A Lyrics Provider is one of ${LYRICS_PROVIDERS.join(', ')}.`

/** Turns untrusted input into a Lyrics Provider name, or throws with `INVALID_LYRICS_PROVIDER_MESSAGE`. */
export function parseLyricsProviderName(input: unknown): LyricsProviderName {
  if (typeof input !== 'string' || !isLyricsProviderName(input)) {
    throw new Error(INVALID_LYRICS_PROVIDER_MESSAGE)
  }
  return input
}

export function isLyricsProviderName(name: string): name is LyricsProviderName {
  return (LYRICS_PROVIDERS as readonly string[]).includes(name)
}

/** What the app says when a Lyrics Provider is asked for that this instance cannot offer. */
export function unavailableProviderMessage(name: LyricsProviderName): string {
  return `${LYRICS_PROVIDER_LABELS[name]} is not configured on this Akapela.`
}

export const LYRICS_KINDS = ['synced', 'plain'] as const
export type LyricsKind = (typeof LYRICS_KINDS)[number]

/** One line of Lyrics. Synced lines carry the song time they are sung at. */
export interface LyricsLine {
  text: string
  /** Song time in milliseconds; absent on Plain Lyrics. */
  atMs?: number
}

/** Lyrics Offset is nudged in tenths of a second, the smallest shift worth hearing. */
export const LYRICS_OFFSET_STEP_MS = 100
export const LYRICS_OFFSET_MIN_MS = -30_000
export const LYRICS_OFFSET_MAX_MS = 30_000

export const INVALID_LYRICS_OFFSET_MESSAGE
  = `The Lyrics Offset is a whole tenth of a second from ${LYRICS_OFFSET_MIN_MS / 1000} `
    + `to ${LYRICS_OFFSET_MAX_MS / 1000} seconds.`

/** Turns untrusted input into a Lyrics Offset in milliseconds, or throws with `INVALID_LYRICS_OFFSET_MESSAGE`. */
export function parseLyricsOffset(input: unknown): number {
  if (
    typeof input !== 'number'
    || !Number.isInteger(input)
    || input % LYRICS_OFFSET_STEP_MS !== 0
    || input < LYRICS_OFFSET_MIN_MS
    || input > LYRICS_OFFSET_MAX_MS
  ) {
    throw new Error(INVALID_LYRICS_OFFSET_MESSAGE)
  }
  return input
}

/** The Lyrics Offset `steps` tenths of a second away from this one, kept inside the range. */
export function nudgeLyricsOffset(offsetMs: number, steps: number): number {
  const next = Math.round(offsetMs / LYRICS_OFFSET_STEP_MS + steps) * LYRICS_OFFSET_STEP_MS
  return Math.max(LYRICS_OFFSET_MIN_MS, Math.min(next, LYRICS_OFFSET_MAX_MS))
}

/** `[mm:ss.xx]` at the start of an LRC line; the fraction may be tenths, hundredths, or thousandths. */
const LRC_TIMESTAMP = /^\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/

/**
 * The Synced lines of an LRC document, in time order. Lines with several
 * timestamps are repeated once per timestamp, which is how LRC writes a
 * repeated chorus. Metadata tags such as `[ar:]` and any line without a
 * timestamp are not Lyrics and are dropped.
 */
export function parseLrc(text: string): LyricsLine[] {
  const lines: LyricsLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    let rest = raw.trim()
    const times: number[] = []
    for (let match = LRC_TIMESTAMP.exec(rest); match; match = LRC_TIMESTAMP.exec(rest)) {
      times.push(lrcTimeMs(match))
      rest = rest.slice(match[0].length)
    }
    for (const atMs of times) lines.push({ text: rest.trim(), atMs })
  }
  return lines.sort((a, b) => a.atMs! - b.atMs!)
}

function lrcTimeMs(match: RegExpExecArray): number {
  const [, minutes, seconds, fraction = ''] = match
  const milliseconds = Number(fraction.padEnd(3, '0') || '0')
  return Number(minutes) * 60_000 + Number(seconds) * 1_000 + milliseconds
}

/**
 * Plain Lyrics, one line per line of text. Blank lines inside the text
 * separate verses and are kept; blank lines at either end are not.
 */
export function parsePlainLyrics(text: string): LyricsLine[] {
  const lines = text.split(/\r?\n/).map(line => ({ text: line.trim() }))
  while (lines.length && !lines[0]!.text) lines.shift()
  while (lines.length && !lines[lines.length - 1]!.text) lines.pop()
  return lines
}

/** Longer than the wordiest song, short enough that nothing silly is stored. */
export const MANUAL_LYRICS_MAX_LENGTH = 50_000

export const INVALID_MANUAL_LYRICS_MESSAGE
  = `Lyrics are one line of text per line sung, at most ${MANUAL_LYRICS_MAX_LENGTH} characters.`

/**
 * Turns pasted or edited text into Plain Lyrics, or throws with
 * `INVALID_MANUAL_LYRICS_MESSAGE`. Manual Lyrics are always Plain: a singer
 * types the words, not the timings.
 */
export function parseManualLyricsText(input: unknown): LyricsLine[] {
  if (typeof input !== 'string' || input.length > MANUAL_LYRICS_MAX_LENGTH) {
    throw new Error(INVALID_MANUAL_LYRICS_MESSAGE)
  }
  const lines = parsePlainLyrics(input)
  if (lines.length === 0) throw new Error(INVALID_MANUAL_LYRICS_MESSAGE)
  return lines
}

/** Lyrics as text to edit: the words alone, since editing them makes them Manual and so Plain. */
export function lyricsText(lines: LyricsLine[]): string {
  return lines.map(line => line.text).join('\n')
}

export interface CurrentLineQuery {
  kind: LyricsKind
  /** Synced lines must be in time order, as `parseLrc` returns them. */
  lines: LyricsLine[]
  /** Song position in milliseconds. Already song time, so tempo needs no handling here. */
  positionMs: number
  /** The Track's Lyrics Offset; positive holds the Lyrics back for a longer intro. */
  offsetMs: number
  /** Duration of the Backing Track, which Plain Lyrics are spread across. */
  durationMs: number
}

/**
 * The line the singer is on, or -1 when there is none. Synced Lyrics have no
 * current line before the first timestamp; Plain Lyrics, having no timing of
 * their own, are spread evenly across the song and start on their first line.
 */
export function currentLineIndex(query: CurrentLineQuery): number {
  const { kind, lines, positionMs, offsetMs, durationMs } = query
  if (lines.length === 0) return -1
  const songMs = positionMs - offsetMs

  if (kind === 'plain') {
    const fraction = durationMs > 0 ? songMs / durationMs : 0
    return clamp(Math.floor(fraction * lines.length), 0, lines.length - 1)
  }

  let index = -1
  for (const line of lines) {
    if (line.atMs === undefined || line.atMs > songMs) break
    index += 1
  }
  return index
}

/** How far through the Plain Lyrics the song is, from 0 to 1, which is where they are scrolled to. */
export function plainScrollFraction(positionMs: number, offsetMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  return clamp((positionMs - offsetMs) / durationMs, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}
