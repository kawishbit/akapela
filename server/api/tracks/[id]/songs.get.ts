import { createError, defineEventHandler, getQuery } from 'h3'
import { LyricsProviderError } from '../../../lyrics/provider'
import { requireTrack } from '../../../lib/require-track'
import { searchSongs } from '../../../lib/songs'

/**
 * The Songs this Track might be. With no query the guess comes from the
 * Track's own title; `?artist=&title=` searches for what the singer typed
 * instead. The guess that produced the matches comes back with them, so the
 * page can show what it looked for.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const { artist, title } = getQuery(event)
  try {
    return await searchSongs(event.context.akapela, track, {
      artist: typeof artist === 'string' ? artist : undefined,
      title: typeof title === 'string' ? title : undefined,
    })
  }
  catch (error) {
    if (error instanceof LyricsProviderError) {
      throw createError({ statusCode: 502, statusMessage: error.message })
    }
    throw error
  }
})
