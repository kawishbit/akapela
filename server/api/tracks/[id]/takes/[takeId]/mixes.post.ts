import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { NO_STEMS_MESSAGE } from '../../../../../../shared/backing-source'
import { INVALID_MIX_REQUEST_MESSAGE, MIX_TEMPO_LOCKED_MESSAGE, parseMixRequest } from '../../../../../../shared/mix'
import { createMix } from '../../../../../lib/mixes'
import { requireTake } from '../../../../../lib/require-take'
import { requireTrack } from '../../../../../lib/require-track'
import { hasStems } from '../../../../../lib/tracks'
import { apiError } from '../../../../../lib/api-error'
import { failure } from '../../../../../../shared/error-codes'

/**
 * Requests a Mix: enqueues a render job that produces it in the background.
 * The Take's tempo travels along automatically; a request naming a different
 * one is rejected outright rather than silently ignored (ADR 0003). Backing
 * Source may override the Take's own, but not onto a Stem the Track does not
 * have (ADR 0003 amendment).
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const take = requireTake(event, track.id)

  let request
  try {
    request = parseMixRequest(await readBody(event))
  }
  catch {
    throw apiError(400, failure('invalidRequest'), INVALID_MIX_REQUEST_MESSAGE)
  }
  if (request.adjustments.tempoPercent !== take.adjustments.tempoPercent) {
    throw apiError(400, failure('tempoLocked'), MIX_TEMPO_LOCKED_MESSAGE)
  }
  if (request.backingSource === 'stems' && !hasStems(event.context.akapela, track)) {
    throw apiError(409, failure('noStems'), NO_STEMS_MESSAGE)
  }

  const mix = createMix(event.context.akapela, take, request)
  setResponseStatus(event, 201)
  return mix
})
