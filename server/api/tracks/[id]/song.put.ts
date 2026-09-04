import { createError, defineEventHandler, readBody } from 'h3'
import { INVALID_SONG_MESSAGE, parseSong, type Song } from '../../../../shared/song'
import { requireTrack } from '../../../lib/require-track'
import { confirmSong } from '../../../lib/songs'

/**
 * Confirm the Song a Track represents, whether tapped from the matches or
 * typed by hand, and fetch its Lyrics. Returns the Track with whatever Lyrics
 * came back, or none when the provider has none for this Song.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  let song: Song
  try {
    song = parseSong(await readBody(event))
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: INVALID_SONG_MESSAGE })
  }
  return confirmSong(event.context.presto, track, song)
})
