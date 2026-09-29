import { defineEventHandler } from 'h3'
import { requireTrack } from '../../../../lib/require-track'
import { DEFAULT_SEPARATION_MODEL } from '../../../../lib/separators/models'
import { latestSeparationJob, startSeparation } from '../../../../lib/tracks'
import { apiError } from '../../../../lib/api-error'
import { failure } from '../../../../../shared/error-codes'

/**
 * Re-enqueue the separate job for a Track whose separation failed, the shape
 * import retry uses — with the Separation Model it failed with, the way a
 * retry from the Jobs page does, not whatever the default has become since.
 */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  if (track.separationState !== 'failed') {
    throw apiError(409, failure('notRetryable'), 'Only a failed separation can be retried')
  }
  const akapela = event.context.akapela
  const failed = latestSeparationJob(akapela, track.id)
  return startSeparation(akapela, track, failed?.separationModel ?? DEFAULT_SEPARATION_MODEL)
})
