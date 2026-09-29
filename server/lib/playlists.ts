import { CodedError, failure } from '../../shared/error-codes'
import { MAX_PLAYLIST_SONGS, type PlaylistKind, type PlaylistLink } from '../../shared/playlist-link'

/**
 * Reading a playlist or album from another service, which is where a Playlist
 * Import starts. Spotify is read from its public embed page, which is
 * unofficial and can change without warning, so every read sits behind
 * `PlaylistReader` — the guard `SourceFetcher` is for yt-dlp — and a page that
 * no longer has the shape it had is its own failure, `playlistUnreadable`.
 */

/** One song as the service lists it, before anything in Akapela is made of it. */
export interface PlaylistSong {
  /** The service's own id for the song, which is how the checklist names what was ticked. */
  serviceId: string
  /** As the service writes it: several artists are one comma-joined string. */
  artist: string
  title: string
  durationMs: number
}

export interface Playlist {
  name: string
  kind: PlaylistKind
  /** How many songs the service says it has; null when it didn't say. */
  total: number | null
  songs: PlaylistSong[]
}

export interface PlaylistReader {
  read(link: PlaylistLink, signal?: AbortSignal): Promise<Playlist>
}

/** A playlist that could not be read, with the code the checklist page shows. */
export class PlaylistError extends CodedError {}

const PAGE_TIMEOUT_MS = 20_000

/** Spotify serves the page it means for a browser to a browser. */
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  'accept': 'text/html',
  'accept-language': 'en',
}

const NEXT_DATA = /<script[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
const SONG_COUNT = /<meta[^>]*\bname="music:song_count"[^>]*\bcontent="(\d+)"[^>]*>|<meta[^>]*\bcontent="(\d+)"[^>]*\bname="music:song_count"[^>]*>/

/**
 * The Spotify embed page (`open.spotify.com/embed/<kind>/<id>`), read without
 * a login: its `__NEXT_DATA__` JSON carries the name and up to 100 songs, but
 * not how many there are in all. That comes from the regular page's
 * `music:song_count` meta tag. With neither saying there are more, a list of
 * exactly 100 might still be the first 100 of more, so it is refused too.
 */
export class SpotifyEmbedReader implements PlaylistReader {
  private readonly fetch: typeof globalThis.fetch

  constructor(fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args)) {
    this.fetch = fetch
  }

  async read(link: PlaylistLink, signal?: AbortSignal): Promise<Playlist> {
    const [embed, total] = await Promise.all([
      this.page(`https://open.spotify.com/embed/${link.kind}/${link.id}`, signal),
      this.songCount(link, signal),
    ])
    if (embed.status === 404 || embed.status === 400) {
      throw new PlaylistError(failure('playlistNotFound'), `Spotify has no ${link.kind} ${link.id}`)
    }
    if (!embed.ok) {
      throw new Error(`Spotify answered HTTP ${embed.status} for ${link.kind} ${link.id}`)
    }

    const entity = readEntity(embed.body, link)
    const listed = entity.trackList.length
    if (total !== null && total > MAX_PLAYLIST_SONGS) throw tooLong(total)
    if (total === null && listed >= MAX_PLAYLIST_SONGS) throw tooLong(`${MAX_PLAYLIST_SONGS}+`)

    return {
      name: entity.name,
      kind: link.kind,
      total,
      songs: entity.trackList
        // A song Spotify won't play where the server is has nothing to match against; it is left out rather than failing the rest.
        .filter(song => song.isPlayable !== false)
        .map(song => ({
          serviceId: song.uri,
          artist: song.subtitle,
          title: song.title,
          durationMs: song.duration,
        })),
    }
  }

  private async page(url: string, signal?: AbortSignal): Promise<{ ok: boolean, status: number, body: string }> {
    const response = await this.fetch(url, {
      headers: BROWSER_HEADERS,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(PAGE_TIMEOUT_MS)]) : AbortSignal.timeout(PAGE_TIMEOUT_MS),
    })
    return { ok: response.ok, status: response.status, body: response.ok ? await response.text() : '' }
  }

  /** The total from the regular page, or null when it could not be had: the embed page is what decides whether there is a playlist at all. */
  private async songCount(link: PlaylistLink, signal?: AbortSignal): Promise<number | null> {
    try {
      const page = await this.page(`https://open.spotify.com/${link.kind}/${link.id}`, signal)
      if (!page.ok) return null
      const match = SONG_COUNT.exec(page.body)
      return match ? Number(match[1] ?? match[2]) : null
    }
    catch (error) {
      if (signal?.aborted) throw error
      return null
    }
  }
}

function tooLong(total: number | string): PlaylistError {
  return new PlaylistError(
    failure('playlistTooLong', { total }),
    `This playlist has ${total} songs; Akapela imports up to ${MAX_PLAYLIST_SONGS}`,
  )
}

interface EmbedSong {
  uri: string
  title: string
  subtitle: string
  duration: number
  isPlayable?: boolean
}

interface EmbedEntity {
  name: string
  trackList: EmbedSong[]
}

/**
 * `props.pageProps.state.data.entity` out of `__NEXT_DATA__`, checked field by
 * field. Anything missing is Spotify having changed its page, said in English
 * for the log (`playlistUnreadable`).
 */
function readEntity(html: string, link: PlaylistLink): EmbedEntity {
  const unreadable = (why: string) => {
    const message = `Spotify's ${link.kind} page for ${link.id} could not be read: ${why}`
    console.warn(message)
    return new PlaylistError(failure('playlistUnreadable'), message)
  }

  const script = NEXT_DATA.exec(html)
  if (!script) throw unreadable('no __NEXT_DATA__')
  let data: unknown
  try {
    data = JSON.parse(script[1]!)
  }
  catch {
    throw unreadable('__NEXT_DATA__ is not JSON')
  }

  const pageProps = pick(data, 'props', 'pageProps')
  // A private or deleted playlist still gets a page, which says so.
  const status = pick(pageProps, 'status')
  if (status === 404 || status === 403) {
    throw new PlaylistError(failure('playlistNotFound'), `Spotify has no public ${link.kind} ${link.id}`)
  }
  const entity = pick(pageProps, 'state', 'data', 'entity')
  if (!entity || typeof entity !== 'object') throw unreadable('no entity')
  const { name, trackList } = entity as Record<string, unknown>
  if (typeof name !== 'string') throw unreadable('the entity has no name')
  if (!Array.isArray(trackList)) throw unreadable('the entity has no trackList')

  const songs = trackList.map((song: unknown, index) => {
    const { uri, title, subtitle, duration, isPlayable } = (song ?? {}) as Record<string, unknown>
    if (typeof uri !== 'string' || typeof title !== 'string' || typeof subtitle !== 'string' || typeof duration !== 'number') {
      throw unreadable(`song ${index + 1} is missing its uri, title, subtitle, or duration`)
    }
    return { uri, title, subtitle, duration, isPlayable: isPlayable === false ? false : undefined }
  })
  return { name, trackList: songs }
}

function pick(value: unknown, ...path: string[]): unknown {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}
