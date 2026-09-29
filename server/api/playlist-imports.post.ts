import { defineEventHandler, readBody } from 'h3'
import { apiError } from '../lib/api-error'
import { playlistRefusal, startPlaylistImport } from '../lib/playlist-imports'
import { failure } from '../../shared/error-codes'

/**
 * Starts a Playlist Import: `{ url, serviceIds }`, the songs ticked in the
 * checklist. Answers with the Playlist Import's id, the Tracks it created,
 * and the songs it skipped because another Track has their Song by now.
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as { url?: unknown, serviceIds?: unknown } | null
  const serviceIds = body?.serviceIds
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || !serviceIds.every(id => typeof id === 'string')) {
    throw apiError(400, failure('invalidRequest'), 'serviceIds must list at least one song')
  }
  try {
    return await startPlaylistImport(event.context.akapela, { url: body?.url, serviceIds })
  }
  catch (error) {
    const refusal = playlistRefusal(error)
    throw apiError(refusal.statusCode, refusal.failure, refusal.message)
  }
})
