import { parseLrc, parsePlainLyrics } from '../../shared/lyrics'
import type { Song } from '../../shared/song'
import {
  LyricsProviderError,
  type FetchedLyrics,
  type LyricsProvider,
  type SongMatch,
  type SongSearchQuery,
} from './provider'

const DEFAULT_BASE_URL = 'https://lrclib.net'

/** LRCLIB asks clients to say who they are; it has no key and no accounts. */
const USER_AGENT = 'Presto/0.1.0 (self-hosted karaoke)'

/** The spec asks for the top few; more than this is a wall of near-identical releases. */
const MAX_MATCHES = 5

/** One record as LRCLIB's search and get endpoints return it. */
interface LrclibRecord {
  id: number
  trackName: string
  artistName: string
  albumName: string | null
  /** Seconds, as a whole number or a fraction. */
  duration: number | null
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export interface LrclibOptions {
  baseUrl?: string
  /** Injected so tests exercise the mapping without the network. */
  fetch?: typeof globalThis.fetch
}

/**
 * The first Lyrics Provider: a public API with no key that answers with both
 * Synced and Plain Lyrics, and has no album art to offer.
 */
export function createLrclibProvider(options: LrclibOptions = {}): LyricsProvider {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const doFetch = options.fetch ?? globalThis.fetch

  async function request(path: string, params: Record<string, string>): Promise<unknown | null> {
    const url = `${baseUrl}${path}?${new URLSearchParams(params)}`
    let response: Response
    try {
      response = await doFetch(url, { headers: { 'user-agent': USER_AGENT, 'accept': 'application/json' } })
    }
    catch (error) {
      throw new LyricsProviderError('lrclib', error instanceof Error ? error.message : String(error))
    }
    // LRCLIB says 404 when it simply has nothing, which is an answer, not a failure.
    if (response.status === 404) return null
    if (!response.ok) throw new LyricsProviderError('lrclib', `HTTP ${response.status}`)
    try {
      return await response.json()
    }
    catch {
      throw new LyricsProviderError('lrclib', 'the answer was not JSON')
    }
  }

  return {
    name: 'lrclib',

    /** LRCLIB needs no account, so it is always there. */
    available: true,

    async searchSongs(query: SongSearchQuery): Promise<SongMatch[]> {
      const title = query.title.trim()
      if (!title) return []
      const artist = query.artist.trim()
      // A guess with no artist is a free-text search; with one, the fielded
      // search is far more precise.
      const params: Record<string, string> = artist
        ? { track_name: title, artist_name: artist }
        : { q: title }
      const body = await request('/api/search', params)
      if (!Array.isArray(body)) return []
      return byClosestDuration(body.map(toSongMatch), query.durationMs).slice(0, MAX_MATCHES)
    },

    async fetchLyrics(song: Song): Promise<FetchedLyrics | null> {
      const id = song.providerIds.lrclib
      const body = id
        ? await request(`/api/get/${encodeURIComponent(id)}`, {})
        : await request('/api/get', { track_name: song.title, artist_name: song.artist })
      if (!body || typeof body !== 'object') return null
      return toLyrics(body as LrclibRecord)
    },
  }
}

/**
 * LRCLIB returns a row per release, so the same Song comes back many times
 * over. The one whose recording is as long as this Track's Backing Track is
 * the one whose timings will fit, so it goes first.
 */
function byClosestDuration(matches: SongMatch[], durationMs: number | null | undefined): SongMatch[] {
  if (!durationMs) return matches
  const distance = (match: SongMatch) =>
    match.durationMs === null ? Number.POSITIVE_INFINITY : Math.abs(match.durationMs - durationMs)
  return matches
    .map((match, order) => ({ match, order }))
    .sort((a, b) => distance(a.match) - distance(b.match) || a.order - b.order)
    .map(({ match }) => match)
}

function toSongMatch(record: LrclibRecord): SongMatch {
  return {
    artist: record.artistName,
    title: record.trackName,
    album: record.albumName ?? null,
    durationMs: record.duration == null ? null : Math.round(record.duration * 1000),
    instrumental: Boolean(record.instrumental),
    providerIds: { lrclib: String(record.id) },
    albumArtUrl: null,
  }
}

function toLyrics(record: LrclibRecord): FetchedLyrics | null {
  const synced = record.syncedLyrics ? parseLrc(record.syncedLyrics) : []
  if (synced.length) return { kind: 'synced', lines: synced }
  const plain = record.plainLyrics ? parsePlainLyrics(record.plainLyrics) : []
  if (plain.length) return { kind: 'plain', lines: plain }
  return null
}
