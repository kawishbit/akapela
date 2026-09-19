/**
 * What a singer can rename on a Track: its title and artist. These are the
 * Track's own, the names the library lists it by, and are not the confirmed
 * Song — which is what Lyrics are looked up by and is changed separately.
 */
export interface TrackDetails {
  title: string
  artist: string | null
}

/** Longer than any YouTube title or file name a Track is imported with. */
export const TRACK_FIELD_MAX_LENGTH = 300

export const INVALID_TRACK_DETAILS_MESSAGE
  = `A Track needs a title, and its title and artist can each be at most ${TRACK_FIELD_MAX_LENGTH} characters.`

/** A title and artist from a request, trimmed, with a blank artist as none. Throws when either will not do. */
export function parseTrackDetails(body: unknown): TrackDetails {
  const { title, artist } = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (typeof title !== 'string' || (artist != null && typeof artist !== 'string')) {
    throw new Error(INVALID_TRACK_DETAILS_MESSAGE)
  }
  const details = { title: title.trim(), artist: artist?.trim() || null }
  if (!details.title || details.title.length > TRACK_FIELD_MAX_LENGTH || (details.artist?.length ?? 0) > TRACK_FIELD_MAX_LENGTH) {
    throw new Error(INVALID_TRACK_DETAILS_MESSAGE)
  }
  return details
}
