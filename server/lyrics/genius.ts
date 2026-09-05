import type { Song } from '../../shared/song'
import { lyricsFromGeniusPage } from './genius-page'
import {
  LyricsProviderError,
  type FetchedLyrics,
  type LyricsProvider,
  type SongMatch,
  type SongSearchQuery,
} from './provider'

const DEFAULT_API_URL = 'https://api.genius.com'

/** The spec asks for the top few; more than this is a wall of remixes and covers. */
const MAX_MATCHES = 5

/**
 * The song page is a public web page rather than the API, and Genius answers
 * a plain client with the page a browser would get.
 */
const PAGE_USER_AGENT = 'Mozilla/5.0 (compatible; Akapela/0.1.0; self-hosted karaoke)'

export interface GeniusOptions {
  /** A Genius API token. Without one the provider is unavailable. */
  token: string
  apiUrl?: string
  /** Injected so tests exercise the mapping without the network. */
  fetch?: typeof globalThis.fetch
}

/** One song as the Genius search and song endpoints describe it. */
interface GeniusSong {
  id: number
  title: string
  url: string
  song_art_image_url?: string | null
  primary_artist?: { name?: string | null } | null
  artist_names?: string | null
  album?: { name?: string | null, cover_art_url?: string | null } | null
}

/**
 * The second Lyrics Provider: Genius, whose text is usually more accurate than
 * LRCLIB's and which brings album art with it. Searching and reading a Song go
 * through the API with a token; the words themselves are on the song page, and
 * `genius-page` is the only thing that knows what that page looks like.
 */
export function createGeniusProvider(options: GeniusOptions): LyricsProvider {
  const token = options.token.trim()
  const apiUrl = (options.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, '')
  const doFetch = options.fetch ?? globalThis.fetch

  /** A GET whose body is JSON, or null when Genius has nothing at that path. */
  async function api(path: string, params: Record<string, string> = {}): Promise<unknown | null> {
    requireToken()
    const query = new URLSearchParams(params).toString()
    const response = await get(`${apiUrl}${path}${query ? `?${query}` : ''}`, {
      'authorization': `Bearer ${token}`,
      'accept': 'application/json',
    })
    if (response.status === 404) return null
    if (!response.ok) throw new LyricsProviderError('genius', `HTTP ${response.status}`)
    try {
      return await response.json()
    }
    catch {
      throw new LyricsProviderError('genius', 'the answer was not JSON')
    }
  }

  async function get(url: string, headers: Record<string, string>): Promise<Response> {
    try {
      return await doFetch(url, { headers })
    }
    catch (error) {
      throw new LyricsProviderError('genius', error instanceof Error ? error.message : String(error))
    }
  }

  function requireToken(): void {
    if (!token) {
      throw new LyricsProviderError('genius', 'no API token is configured')
    }
  }

  /** The songs Genius returns for a free-text query, best first, as it ranks them. */
  async function search(query: string): Promise<GeniusSong[]> {
    const body = await api('/search', { q: query })
    const hits = (body as { response?: { hits?: unknown } } | null)?.response?.hits
    if (!Array.isArray(hits)) return []
    return hits
      .filter(hit => hit?.type === 'song' && hit?.result?.id)
      .map(hit => hit.result as GeniusSong)
  }

  /** The full record for one song, which is where the album and the page URL are. */
  async function songById(id: string): Promise<GeniusSong | null> {
    const body = await api(`/songs/${encodeURIComponent(id)}`)
    const song = (body as { response?: { song?: unknown } } | null)?.response?.song
    return song && typeof song === 'object' ? (song as GeniusSong) : null
  }

  /** One song's own record, or null when it cannot be read: an album is worth an extra call, not a failure. */
  async function detailsOf(hit: GeniusSong): Promise<GeniusSong | null> {
    try {
      return await songById(String(hit.id))
    }
    catch {
      return null
    }
  }

  return {
    name: 'genius',

    get available() {
      return token.length > 0
    },

    async searchSongs(query: SongSearchQuery): Promise<SongMatch[]> {
      const title = query.title.trim()
      if (!title) return []
      const hits = (await search(`${query.artist.trim()} ${title}`.trim())).slice(0, MAX_MATCHES)
      // The search hit names the Song but not its album, which the singer needs
      // to tell two recordings apart, so each is read in full.
      return Promise.all(hits.map(async hit => toSongMatch(hit, await detailsOf(hit))))
    },

    /**
     * The words on the Song's Genius page. A Song confirmed through another
     * provider has no Genius id, so it is searched for first; one Genius does
     * not know simply has no Lyrics here.
     */
    async fetchLyrics(song: Song): Promise<FetchedLyrics | null> {
      requireToken()
      const id = song.providerIds.genius ?? (await search(`${song.artist} ${song.title}`.trim()))[0]?.id
      if (id === undefined) return null
      const found = await songById(String(id))
      if (!found?.url) return null

      const response = await get(found.url, { 'user-agent': PAGE_USER_AGENT, 'accept': 'text/html' })
      if (response.status === 404) return null
      if (!response.ok) throw new LyricsProviderError('genius', `HTTP ${response.status}`)
      const lines = lyricsFromGeniusPage(await response.text())
      // Genius has no timings, so its Lyrics are always Plain.
      return lines.length ? { kind: 'plain', lines: lines.map(text => ({ text })) } : null
    },
  }
}

function toSongMatch(hit: GeniusSong, details: GeniusSong | null): SongMatch {
  const albumArt = details?.album?.cover_art_url ?? hit.song_art_image_url ?? null
  return {
    artist: hit.primary_artist?.name ?? hit.artist_names ?? '',
    title: hit.title,
    album: details?.album?.name ?? null,
    // Genius describes the work, not a recording, so it has no duration to rank by.
    durationMs: null,
    instrumental: false,
    providerIds: { genius: String(hit.id) },
    albumArtUrl: albumArt,
  }
}
