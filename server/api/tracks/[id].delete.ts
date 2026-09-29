import { defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { deleteTrack } from '../../lib/tracks'
import { apiError } from '../../lib/api-error'
import { failure } from '../../../shared/error-codes'

/** Remove a Track: its rows, its jobs, and every file under its directory. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!deleteTrack(event.context.akapela, id)) {
    throw apiError(404, failure('trackNotFound'), 'Track not found')
  }
  return sendNoContent(event)
})
