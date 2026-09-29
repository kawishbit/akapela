import { defineEventHandler, readBody } from 'h3'
import { INVALID_ADJUSTMENTS_MESSAGE, parseAdjustments, type Adjustments } from '../../../../shared/adjustments'
import { requireTrack } from '../../../lib/require-track'
import { saveAdjustments } from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/** Save the Adjustments last used on a Track. The body is the whole parameter object. */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  let adjustments: Adjustments
  try {
    adjustments = parseAdjustments(await readBody(event))
  }
  catch {
    throw apiError(400, failure('invalidRequest'), INVALID_ADJUSTMENTS_MESSAGE)
  }
  return saveAdjustments(event.context.akapela, track, adjustments)
})
