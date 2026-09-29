import type { Playlist, PlaylistReader } from '../../server/lib/playlists'
import type { PlaylistLink } from '../../shared/playlist-link'

/** What the stand-in Spotify answers with, set per test before the call that reads it. */
export interface CannedPlaylistReader {
  /** The playlist every link reads as. */
  playlist: Playlist
  /** When set, reading rejects with it instead. */
  error: Error | null
  /** Every link it was asked to read. */
  reads: PlaylistLink[]
}

/** A `PlaylistReader` standing in for Spotify, so no test reaches it. */
export function createFakePlaylistReader(): { reader: PlaylistReader, canned: CannedPlaylistReader } {
  const canned: CannedPlaylistReader = {
    playlist: { name: 'Empty', kind: 'playlist', total: 0, songs: [] },
    error: null,
    reads: [],
  }
  const reader: PlaylistReader = {
    async read(link) {
      canned.reads.push(link)
      if (canned.error) throw canned.error
      return structuredClone(canned.playlist)
    },
  }
  return { reader, canned }
}

/** One song as Spotify lists it. */
export function spotifySong(artist: string, title: string, durationMs = 200_000, serviceId = `spotify:track:${artist}-${title}`) {
  return { serviceId, artist, title, durationMs }
}
