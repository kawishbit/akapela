/**
 * A link to a playlist or an album on another service, which is what starts a
 * Playlist Import: Spotify, or YouTube and YouTube Music. Read on both sides
 * of the wire: the Library's import field sends one to the checklist page,
 * and the server reads it again.
 */

/** The most songs one Playlist Import takes; a longer playlist or album is refused whole. */
export const MAX_PLAYLIST_SONGS = 100

export const PLAYLIST_KINDS = ['playlist', 'album'] as const
export type PlaylistKind = (typeof PLAYLIST_KINDS)[number]

export const PLAYLIST_SERVICES = ['spotify', 'youtube'] as const
export type PlaylistService = (typeof PLAYLIST_SERVICES)[number]

export interface PlaylistLink {
  service: PlaylistService
  kind: PlaylistKind
  /** The service's own id for the playlist or album. */
  id: string
}

const SPOTIFY_ID = /^[A-Za-z0-9]+$/

/** `spotify:playlist:<id>` or `spotify:album:<id>`. */
const SPOTIFY_URI = /^spotify:(playlist|album):([A-Za-z0-9]+)$/

/** A YouTube list id: URL-safe base64, longer than a video id. */
const YOUTUBE_LIST_ID = /^[A-Za-z0-9_-]{12,}$/

/** A YouTube Music album is a list whose id starts so. */
const YOUTUBE_ALBUM_PREFIX = 'OLAK5uy_'

/**
 * A Mix: a list YouTube makes up from one video, endless and different on
 * every visit. Its id starts `RD`, as does a playlist YouTube Music curates
 * itself (`RDCLAK5uy_`), which is a real playlist.
 */
function isMix(id: string): boolean {
  return id.startsWith('RD') && !id.startsWith('RDCLAK5uy_')
}

/** Channel pages, under which there is no one list to import. */
const YOUTUBE_CHANNEL = /^\/(@[^/]+|channel\/|c\/|user\/)/

/**
 * The playlist or album a link names, or null for anything else: a song, an
 * artist, a single video, a Mix, a channel, or a link to another site.
 *
 * Spotify: the web link with or without an `intl-xx/` segment or a query
 * string, the embed link, and the `spotify:` URI form. YouTube: a
 * `/playlist?list=` link on youtube.com or music.youtube.com. A video opened
 * inside a playlist is the video (`playlistInVideoLink`).
 */
export function parsePlaylistLink(input: string): PlaylistLink | null {
  const text = input.trim()
  const uri = SPOTIFY_URI.exec(text)
  if (uri) return { service: 'spotify', kind: uri[1] as PlaylistKind, id: uri[2]! }

  const url = parseUrl(text)
  if (!url) return null
  if (isYoutubeHost(url)) {
    if (url.pathname.replace(/\/+$/, '') !== '/playlist') return null
    return youtubeList(url.searchParams.get('list'))
  }
  if (url.hostname !== 'open.spotify.com') return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0]?.startsWith('intl-')) segments.shift()
  if (segments[0] === 'embed') segments.shift()
  if (segments.length !== 2) return null
  const [kind, id] = segments as [string, string]
  if (!(PLAYLIST_KINDS as readonly string[]).includes(kind) || !SPOTIFY_ID.test(id)) return null
  return { service: 'spotify', kind: kind as PlaylistKind, id }
}

/**
 * The playlist a YouTube video link was opened from (`watch?v=…&list=…`),
 * which the import field offers to import instead of the one video. Null for
 * anything else, and for a Mix.
 */
export function playlistInVideoLink(input: string): PlaylistLink | null {
  const url = parseUrl(input.trim())
  if (!url || !isYoutubeHost(url) || url.pathname.replace(/\/+$/, '') !== '/watch') return null
  return youtubeList(url.searchParams.get('list'))
}

/**
 * Whether a link is a YouTube Mix or a channel: lists Akapela will not
 * import, which the import field says so of rather than calling the link
 * wrong.
 */
export function unsupportedYoutubeList(input: string): boolean {
  const url = parseUrl(input.trim())
  if (!url || !isYoutubeHost(url)) return false
  if (YOUTUBE_CHANNEL.test(url.pathname)) return true
  const list = url.searchParams.get('list')
  return list ? isMix(list) : false
}

/** The canonical web link for a playlist or album, which is what the checklist page's URL carries. */
export function playlistUrl(link: PlaylistLink): string {
  if (link.service === 'youtube') return `https://www.youtube.com/playlist?list=${link.id}`
  return `https://open.spotify.com/${link.kind}/${link.id}`
}

function parseUrl(text: string): URL | null {
  if (!text) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  }
  catch {
    return null
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
}

function isYoutubeHost(url: URL): boolean {
  return url.hostname.toLowerCase().replace(/^(www|m|music)\./, '') === 'youtube.com'
}

function youtubeList(id: string | null): PlaylistLink | null {
  if (!id || !YOUTUBE_LIST_ID.test(id) || isMix(id)) return null
  return { service: 'youtube', kind: id.startsWith(YOUTUBE_ALBUM_PREFIX) ? 'album' : 'playlist', id }
}
