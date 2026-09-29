import { defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { requireTrack } from '../../../../lib/require-track'
import { deleteTake } from '../../../../lib/takes'
import { apiError } from '../../../../lib/api-error'
import { failure } from '../../../../../shared/error-codes'

/** Remove a Take: its row and its WAV file. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  const takeId = getRouterParam(event, 'takeId') ?? ''
  if (!deleteTake(event.context.akapela, track.id, takeId)) {
    throw apiError(404, failure('takeNotFound'), 'Take not found')
  }
  return sendNoContent(event)
})
