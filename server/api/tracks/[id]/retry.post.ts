import { createError, defineEventHandler } from 'h3'
import { requireTrack } from '../../../lib/require-track'
import { retryImport } from '../../../lib/tracks'

/** Re-enqueue the import job for a Track whose import failed. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  if (track.importState !== 'failed') {
    throw createError({ statusCode: 409, statusMessage: 'Only a failed import can be retried' })
  }
  return retryImport(event.context.akapela, track)
})
