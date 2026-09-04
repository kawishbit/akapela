import { createError, defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { requireTrack } from '../../../../lib/require-track'
import { deleteTake } from '../../../../lib/takes'

/** Remove a Take: its row and its WAV file. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  const takeId = getRouterParam(event, 'takeId') ?? ''
  if (!deleteTake(event.context.presto, track.id, takeId)) {
    throw createError({ statusCode: 404, statusMessage: 'Take not found' })
  }
  return sendNoContent(event)
})
