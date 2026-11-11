import { CodedError, failure } from '../../shared/error-codes'
import { MAX_PLAYLIST_SONGS, playlistUrl, type PlaylistKind, type PlaylistLink, type PlaylistService } from '../../shared/playlist-link'
import { listYoutubePlaylist } from './sources'

/**
 * Reading a playlist or album from another service, which is where a Playlist
 * Import starts. Spotify is read from its public embed page, which is
 * unofficial and can change without warning, so every read sits behind
 * `PlaylistReader` — the guard `SourceFetcher` is for yt-dlp — and a page that
 * no longer has the shape it had is its own failure, `playlistUnreadable`.
 * A YouTube playlist is listed by yt-dlp.
 */

/**
 * One song as the service lists it, before anything in Akapela is made of it.
 * From YouTube it is a video: its id, its title, and the channel that
 * uploaded it as the artist.
 */
export interface PlaylistSong {
  /** The service's own id for the song, which is how the checklist names what was ticked. A YouTube video's id. */
  serviceId: string
  /** As the service writes it: several artists are one comma-joined string. A YouTube video's channel. */
  artist: string
  title: string
  /** 0 when YouTube's listing did not say. */
  durationMs: number
}

export interface Playlist {
  name: string
  kind: PlaylistKind
  /** How many songs the service says it has; null when it didn't say. */
  total: number | null
  /** How many the service listed that cannot be imported and are not in `songs`: unplayable here, private, or deleted. */
  leftOut: number
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

    // A song Spotify won't play where the server is has nothing to match against; it is left out rather than failing the rest.
    const playable = entity.trackList.filter(song => song.isPlayable !== false)
    return {
      name: entity.name,
      kind: link.kind,
      total,
      leftOut: listed - playable.length,
      songs: playable
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

/** Lists a YouTube playlist: yt-dlp's `-J --flat-playlist` answer, as text. */
export type YoutubePlaylistLister = (url: string, signal?: AbortSignal) => Promise<string>

/** What yt-dlp says of a list YouTube has no public copy of. */
const NO_SUCH_PLAYLIST = /playlist does not exist|playlist.*(?:private|unavailable)|unviewable/i

/** How YouTube's flat listing names an entry nobody can watch. */
const UNAVAILABLE_TITLE = /^\[(?:private|deleted|unavailable) video\]$/i
const UNAVAILABLE = new Set(['private', 'needs_auth', 'subscriber_only', 'premium_only'])

/**
 * A YouTube or YouTube Music playlist, listed by yt-dlp without opening each
 * video. A private or deleted video is left out and counted. Over 100 is
 * refused whole, the same as from Spotify, so one paste never queues more.
 */
export class YoutubePlaylistReader implements PlaylistReader {
  private readonly list: YoutubePlaylistLister

  constructor(list: YoutubePlaylistLister = listYoutubePlaylist) {
    this.list = list
  }

  async read(link: PlaylistLink, signal?: AbortSignal): Promise<Playlist> {
    let stdout: string
    try {
      stdout = await this.list(playlistUrl(link), signal)
    }
    catch (error) {
      if (error instanceof Error && NO_SUCH_PLAYLIST.test(error.message)) {
        throw new PlaylistError(failure('playlistNotFound'), `YouTube has no public playlist ${link.id}`)
      }
      throw error
    }

    let info: Record<string, unknown>
    try {
      info = JSON.parse(stdout) ?? {}
    }
    catch {
      throw new PlaylistError(failure('playlistUnreadable'), `yt-dlp's listing of ${link.id} is not JSON`)
    }
    const entries = Array.isArray(info.entries) ? info.entries as Record<string, unknown>[] : []
    const total = typeof info.playlist_count === 'number' ? info.playlist_count : entries.length
    if (Math.max(total, entries.length) > MAX_PLAYLIST_SONGS) throw tooLong(Math.max(total, entries.length))

    const songs = entries.flatMap((entry): PlaylistSong[] => {
      const { id, title, channel, uploader, duration, availability } = entry ?? {}
      if (typeof id !== 'string' || !id || typeof title !== 'string') return []
      if (UNAVAILABLE_TITLE.test(title.trim()) || UNAVAILABLE.has(availability as string)) return []
      const by = typeof channel === 'string' ? channel : typeof uploader === 'string' ? uploader : ''
      return [{
        serviceId: id,
        // An artist's auto-generated channel is named for them, with this on the end.
        artist: by.replace(/ - Topic$/, ''),
        title,
        durationMs: typeof duration === 'number' ? Math.round(duration * 1000) : 0,
      }]
    })
    return {
      name: typeof info.title === 'string' && info.title ? info.title : link.id,
      kind: link.kind,
      total,
      leftOut: entries.length - songs.length,
      songs,
    }
  }
}

/** Reads each link with the reader for its service. */
export class ServicePlaylistReader implements PlaylistReader {
  private readonly readers: Record<PlaylistService, PlaylistReader>

  constructor(readers: Record<PlaylistService, PlaylistReader> = { spotify: new SpotifyEmbedReader(), youtube: new YoutubePlaylistReader() }) {
    this.readers = readers
  }

  read(link: PlaylistLink, signal?: AbortSignal): Promise<Playlist> {
    return this.readers[link.service].read(link, signal)
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
