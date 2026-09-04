import { createError, defineEventHandler, readBody } from 'h3'
import { INVALID_SONG_MESSAGE, parseSong, type Song } from '../../../../shared/song'
import { requireTrack } from '../../../lib/require-track'
import { confirmSong } from '../../../lib/songs'
import { ManualLyricsOverwriteError } from '../../../lib/track-lyrics'

/**
 * Confirm the Song a Track represents, whether tapped from the matches or
 * typed by hand, and fetch its Lyrics from the Track's Lyrics Provider.
 * Returns the Track with whatever Lyrics came back, or none when the provider
 * has none for this Song. Lyrics the singer typed are only replaced when the
 * body says `overwriteManual`, which is what the page sends once it has asked.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const body = (await readBody(event)) as { overwriteManual?: unknown } | null
  let song: Song
  try {
    song = parseSong(body)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: INVALID_SONG_MESSAGE })
  }

  try {
    return await confirmSong(event.context.presto, track, song, {
      overwriteManual: body?.overwriteManual === true,
    })
  }
  catch (error) {
    if (error instanceof ManualLyricsOverwriteError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
})
