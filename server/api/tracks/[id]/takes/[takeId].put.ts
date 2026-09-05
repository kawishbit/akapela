import { createError, defineEventHandler, readBody } from 'h3'
import { INVALID_TAKE_REVIEW_MESSAGE, TAKE_TEMPO_LOCKED_MESSAGE, parseTakeReviewUpdate } from '../../../../../shared/take'
import { requireTake } from '../../../../lib/require-take'
import { requireTrack } from '../../../../lib/require-track'
import { updateTakeReview } from '../../../../lib/takes'

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
    throw createError({ statusCode: 400, statusMessage: INVALID_TAKE_REVIEW_MESSAGE })
  }
  if (update.adjustments.tempoPercent !== take.adjustments.tempoPercent) {
    throw createError({ statusCode: 400, statusMessage: TAKE_TEMPO_LOCKED_MESSAGE })
  }

  return updateTakeReview(event.context.akapela, take, update)
})
