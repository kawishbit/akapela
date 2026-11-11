import { defineEventHandler, readBody } from 'h3'
import { apiError } from '../lib/api-error'
import { playlistRefusal, startPlaylistImport } from '../lib/playlist-imports'
import { failure } from '../../shared/error-codes'

/**
 * Starts a Playlist Import: `{ url, serviceIds, separate? }`, the songs ticked
 * in the checklist and whether to separate each once it is imported, which is
 * on unless it is `false`. Answers with the Playlist Import's id, the Tracks it
 * created, and the songs it skipped because they are in the Library by now.
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as { url?: unknown, serviceIds?: unknown, separate?: unknown } | null
  const serviceIds = body?.serviceIds
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || !serviceIds.every(id => typeof id === 'string')) {
    throw apiError(400, failure('invalidRequest'), 'serviceIds must list at least one song')
  }
  const separate = body?.separate
  if (separate !== undefined && typeof separate !== 'boolean') {
    throw apiError(400, failure('invalidRequest'), 'separate must be true or false')
  }
  try {
    return await startPlaylistImport(event.context.akapela, { url: body?.url, serviceIds, separate })
  }
  catch (error) {
    const refusal = playlistRefusal(error)
    throw apiError(refusal.statusCode, refusal.failure, refusal.message)
  }
})
