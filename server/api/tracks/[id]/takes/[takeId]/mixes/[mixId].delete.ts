import { createError, defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { deleteMix } from '../../../../../../lib/mixes'
import { requireTake } from '../../../../../../lib/require-take'
import { requireTrack } from '../../../../../../lib/require-track'

/** Remove a Mix: its row and its MP3 and (when rendered) WAV files. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  const take = requireTake(event, track.id)
  const mixId = getRouterParam(event, 'mixId') ?? ''
  if (!deleteMix(event.context.presto, track.id, take.id, mixId)) {
    throw createError({ statusCode: 404, statusMessage: 'Mix not found' })
  }
  return sendNoContent(event)
})
