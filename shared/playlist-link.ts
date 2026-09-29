/**
 * A link to a playlist or an album on another service, which is what starts a
 * Playlist Import. Read on both sides of the wire: the Library's import field
 * sends one to the checklist page, and the server reads it again.
 */

/** The most songs one Playlist Import takes; a longer playlist or album is refused whole. */
export const MAX_PLAYLIST_SONGS = 100

export const PLAYLIST_KINDS = ['playlist', 'album'] as const
export type PlaylistKind = (typeof PLAYLIST_KINDS)[number]

export interface PlaylistLink {
  service: 'spotify'
  kind: PlaylistKind
  /** The service's own id for the playlist or album. */
  id: string
}

const SPOTIFY_ID = /^[A-Za-z0-9]+$/

/** `spotify:playlist:<id>` or `spotify:album:<id>`. */
const SPOTIFY_URI = /^spotify:(playlist|album):([A-Za-z0-9]+)$/

/**
 * The playlist or album a Spotify link names, or null for anything else: a
 * song, an artist, or a link to another site. Takes the web link with or
 * without an `intl-xx/` segment or a query string, the embed link, and the
 * `spotify:` URI form.
 */
export function parsePlaylistLink(input: string): PlaylistLink | null {
  const text = input.trim()
  const uri = SPOTIFY_URI.exec(text)
  if (uri) return { service: 'spotify', kind: uri[1] as PlaylistKind, id: uri[2]! }

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  }
  catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.hostname !== 'open.spotify.com') return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0]?.startsWith('intl-')) segments.shift()
  if (segments[0] === 'embed') segments.shift()
  if (segments.length !== 2) return null
  const [kind, id] = segments as [string, string]
  if (!(PLAYLIST_KINDS as readonly string[]).includes(kind) || !SPOTIFY_ID.test(id)) return null
  return { service: 'spotify', kind: kind as PlaylistKind, id }
}

/** The canonical web link for a playlist or album, which is what the checklist page's URL carries. */
export function playlistUrl(link: PlaylistLink): string {
  return `https://open.spotify.com/${link.kind}/${link.id}`
}
