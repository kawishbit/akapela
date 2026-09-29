import { defineEventHandler, readBody } from 'h3'
import { apiError } from '../../lib/api-error'
import { playlistRefusal, previewPlaylist } from '../../lib/playlist-imports'

/**
 * The checklist for a Playlist Import: the playlist's name and songs, each
 * saying whether importing it would make a new Track, and what a Separation
 * costs here, for the estimate. `{ url }` in, nothing created.
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as { url?: unknown } | null
  try {
    return await previewPlaylist(event.context.akapela, body?.url)
  }
  catch (error) {
    const refusal = playlistRefusal(error)
    throw apiError(refusal.statusCode, refusal.failure, refusal.message)
  }
})
