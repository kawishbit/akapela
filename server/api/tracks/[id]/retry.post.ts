import { defineEventHandler, readBody } from 'h3'
import { requireTrack } from '../../../lib/require-track'
import {
  needsYoutubeLink,
  retryImport,
  retryImportFromLink,
  YOUTUBE_LINK_NEEDED_MESSAGE,
} from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { CodedError, failure } from '../../../../shared/error-codes'

/**
 * Re-enqueue the import job for a Track whose import failed. A Playlist
 * Import's Track that found nothing on YouTube has no link to retry, so it
 * takes one in the body, `{ url }`, and imports from that.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  if (track.importState !== 'failed') {
    throw apiError(409, failure('notRetryable'), 'Only a failed import can be retried')
  }
  const akapela = event.context.akapela
  if (!needsYoutubeLink(track)) return retryImport(akapela, track)

  const body = (await readBody(event).catch(() => null)) as { url?: unknown } | null
  if (typeof body?.url !== 'string' || !body.url.trim()) {
    throw apiError(409, failure('youtubeLinkNeeded'), YOUTUBE_LINK_NEEDED_MESSAGE)
  }
  try {
    return retryImportFromLink(akapela, track, body.url)
  }
  catch (error) {
    if (error instanceof CodedError && error.code === 'invalidYoutubeUrl') {
      throw apiError(400, error.failure, error.message)
    }
    throw error
  }
})
