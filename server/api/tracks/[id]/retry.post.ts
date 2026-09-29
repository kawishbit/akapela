import { defineEventHandler } from 'h3'
import { requireTrack } from '../../../lib/require-track'
import { retryImport } from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/** Re-enqueue the import job for a Track whose import failed. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  if (track.importState !== 'failed') {
    throw apiError(409, failure('notRetryable'), 'Only a failed import can be retried')
  }
  return retryImport(event.context.akapela, track)
})
