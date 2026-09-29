import { defineEventHandler } from 'h3'
import { getJob } from '../../../../../../../lib/jobs'
import { retryMix } from '../../../../../../../lib/mixes'
import { requireMix } from '../../../../../../../lib/require-mix'
import { requireTake } from '../../../../../../../lib/require-take'
import { requireTrack } from '../../../../../../../lib/require-track'
import { apiError } from '../../../../../../../lib/api-error'
import { failure } from '../../../../../../../../shared/error-codes'

/** Re-enqueue the render job for a Mix whose previous one failed. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  const take = requireTake(event, track.id)
  const mix = requireMix(event, take.id)
  const job = getJob(event.context.akapela, mix.jobId)
  if (job?.state !== 'failed') {
    throw apiError(409, failure('notRetryable'), 'Only a failed render can be retried')
  }
  return retryMix(event.context.akapela, mix)
})
