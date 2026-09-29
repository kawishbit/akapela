import { defineEventHandler, readBody } from 'h3'
import { INVALID_TAKE_REVIEW_MESSAGE, TAKE_TEMPO_LOCKED_MESSAGE, parseTakeReviewUpdate } from '../../../../../shared/take'
import { requireTake } from '../../../../lib/require-take'
import { requireTrack } from '../../../../lib/require-track'
import { updateTakeReview } from '../../../../lib/takes'
import { apiError } from '../../../../lib/api-error'
import { failure } from '../../../../../shared/error-codes'

/**
 * Saves the Review screen's settings on a Take: latency nudge, vocal and
 * backing gain, and pitch. Tempo cannot change here — a Take is sung to a
 * fixed tempo and a later Mix render assumes it still is (ADR 0003).
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const take = requireTake(event, track.id)

  let update
  try {
    update = parseTakeReviewUpdate(await readBody(event))
  }
  catch {
    throw apiError(400, failure('invalidRequest'), INVALID_TAKE_REVIEW_MESSAGE)
  }
  if (update.adjustments.tempoPercent !== take.adjustments.tempoPercent) {
    throw apiError(400, failure('tempoLocked'), TAKE_TEMPO_LOCKED_MESSAGE)
  }

  return updateTakeReview(event.context.akapela, take, update)
})
