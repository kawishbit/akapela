/**
 * Song: the musical work a Track represents, an artist and a title, used to
 * look up Lyrics. A Track has at most one confirmed Song.
 *
 * Guessing a Song from a video title is a pure function so it can be tested
 * on its own and run on either side of the wire.
 */

import { LYRICS_PROVIDERS, type LyricsProviderName } from './lyrics'

/** The confirmed Song embedded on a Track. */
export interface Song {
  artist: string
  title: string
  /** Per Lyrics Provider handle for fetching this Song again, keyed by provider name. */
  providerIds: SongProviderIds
  /** Album art from the provider that supplied the Song, when it has any. */
  albumArtUrl: string | null
}

/** The handle each Lyrics Provider knows a Song by; a provider that has none is absent. */
export type SongProviderIds = Partial<Record<LyricsProviderName, string>>

/** A proposed artist and title, before any provider has confirmed it exists. */
export interface SongGuess {
  artist: string
  title: string
}

/**
 * Words that describe the video rather than the Song. Removed wherever they
 * stand alone, so `Yesterday Karaoke` looks up as `Yesterday`. The list stays
 * short and unambiguous: a word that could open a real title (Video, Audio,
 * Live) is only noise inside brackets.
 */
const STANDALONE_NOISE = [
  'karaoke',
  'instrumental',
  'instrumentals',
  'lyrics',
  'lyric',
  'official',
  'hd',
  'hq',
  'uhd',
  '4k',
  '8k',
  '1080p',
  '720p',
  'mv',
]

/**
 * Words that make a bracketed segment a note about the video. Any one of them
 * inside `(...)`, `[...]`, or `{...}` drops the whole segment, so
 * `(Official Music Video)` goes and `(feat. Someone)` stays.
 */
const BRACKET_NOISE = [
  ...STANDALONE_NOISE,
  'video',
  'audio',
  'visualizer',
  'visualiser',
  'version',
  'cover',
  'live',
  'remaster',
  'remastered',
  'backing',
  'minus',
  'vocals',
  'vocal',
  'singalong',
  'along',
  'sub',
  'subtitles',
  'explicit',
  'free',
  'download',
]

const BRACKETED = /\(([^()]*)\)|\[([^[\]]*)\]|\{([^{}]*)\}/g

/** A dash needs space around it so `Jay-Z` survives; a pipe is a separator wherever it appears. */
const SEPARATOR = /\s+[-–—―]\s+|\s*\|\s*/

/** Separator and quote characters left stranded once noise around them is gone. */
const EDGE_PUNCTUATION = /^["'“”«»‹›\s|\-–—―:,.]+|["'“”«»‹›\s|\-–—―:,.]+$/g

/**
 * The Songs a video title or filename might name, best guess first. Bracketed
 * segments describing the video and standalone noise words are stripped, the
 * remainder is split on its first dash or pipe, and both readings of the two
 * sides are proposed, since `Yesterday - The Beatles` is as common as the
 * other way round.
 */
export function guessSongs(rawTitle: string): SongGuess[] {
  const cleaned = stripNoise(rawTitle)
  if (!cleaned) return []

  const separator = SEPARATOR.exec(cleaned)
  if (!separator) return [{ artist: '', title: cleaned }]

  const left = trimEdges(cleaned.slice(0, separator.index))
  const right = trimEdges(cleaned.slice(separator.index + separator[0].length))
  if (!left) return right ? [{ artist: '', title: right }] : []
  if (!right) return [{ artist: '', title: left }]
  if (left === right) return [{ artist: left, title: right }]
  return [
    { artist: left, title: right },
    { artist: right, title: left },
  ]
}

/** Removes bracketed notes about the video and standalone noise words, then tidies the whitespace. */
function stripNoise(rawTitle: string): string {
  const withoutBrackets = rawTitle.replace(BRACKETED, (segment, ...groups) => {
    const inside = String(groups.find(group => typeof group === 'string') ?? '')
    return hasNoiseWord(inside, BRACKET_NOISE) ? ' ' : segment
  })
  const withoutWords = withoutBrackets.replace(/[\p{L}\p{N}]+/gu, word =>
    STANDALONE_NOISE.includes(word.toLowerCase()) ? ' ' : word)
  return trimEdges(withoutWords)
}

function hasNoiseWord(text: string, noise: string[]): boolean {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).some(word => noise.includes(word))
}

function trimEdges(text: string): string {
  return text.replace(/\s+/g, ' ').replace(EDGE_PUNCTUATION, '').trim()
}

/** Long enough for the wordiest real title, short enough that nothing silly is stored. */
export const SONG_FIELD_MAX_LENGTH = 300

export const INVALID_SONG_MESSAGE
  = `A Song needs an artist and a title, each at most ${SONG_FIELD_MAX_LENGTH} characters.`

/** Turns untrusted input into a Song, or throws with `INVALID_SONG_MESSAGE`. */
export function parseSong(input: unknown): Song {
  if (!input || typeof input !== 'object') throw new Error(INVALID_SONG_MESSAGE)
  const { artist, title, providerIds, albumArtUrl } = input as Record<string, unknown>
  if (!isField(artist) || !isField(title)) throw new Error(INVALID_SONG_MESSAGE)
  return {
    artist: artist.trim(),
    title: title.trim(),
    providerIds: parseProviderIds(providerIds),
    albumArtUrl: parseAlbumArtUrl(albumArtUrl),
  }
}

function isField(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= SONG_FIELD_MAX_LENGTH
}

/** Only ids belonging to a known Lyrics Provider are kept, so nothing else rides along. */
function parseProviderIds(input: unknown): SongProviderIds {
  if (!input || typeof input !== 'object') return {}
  const ids: SongProviderIds = {}
  for (const name of LYRICS_PROVIDERS) {
    const id = (input as Record<string, unknown>)[name]
    if (typeof id === 'string' && id && id.length <= SONG_FIELD_MAX_LENGTH) ids[name] = id
  }
  return ids
}

function parseAlbumArtUrl(input: unknown): string | null {
  if (typeof input !== 'string' || !input) return null
  try {
    const url = new URL(input)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  }
  catch {
    return null
  }
}
