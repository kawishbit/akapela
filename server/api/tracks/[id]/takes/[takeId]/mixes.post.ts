import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { INVALID_MIX_REQUEST_MESSAGE, MIX_TEMPO_LOCKED_MESSAGE, parseMixRequest } from '../../../../../../shared/mix'
import { createMix } from '../../../../../lib/mixes'
import { requireTake } from '../../../../../lib/require-take'
import { requireTrack } from '../../../../../lib/require-track'

/**
 * Requests a Mix: enqueues a render job that produces it in the background.
 * The Take's tempo travels along automatically; a request naming a different
 * one is rejected outright rather than silently ignored (ADR 0003).
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const take = requireTake(event, track.id)

  let request
  try {
    request = parseMixRequest(await readBody(event))
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: INVALID_MIX_REQUEST_MESSAGE })
  }
  if (request.adjustments.tempoPercent !== take.adjustments.tempoPercent) {
    throw createError({ statusCode: 400, statusMessage: MIX_TEMPO_LOCKED_MESSAGE })
  }

  const mix = createMix(event.context.presto, take, request)
  setResponseStatus(event, 201)
  return mix
})
