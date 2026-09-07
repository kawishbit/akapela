import { createError, defineEventHandler } from 'h3'
import { requireTrack } from '../../../../lib/require-track'
import { startSeparation } from '../../../../lib/tracks'

/** Re-enqueue the separate job for a Track whose separation failed, the shape import retry uses. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  if (track.separationState !== 'failed') {
    throw createError({ statusCode: 409, statusMessage: 'Only a failed separation can be retried' })
  }
  return startSeparation(event.context.akapela, track)
})
