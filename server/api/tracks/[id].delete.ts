import { createError, defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { deleteTrack } from '../../lib/tracks'

/** Remove a Track: its rows, its jobs, and every file under its directory. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!deleteTrack(event.context.presto, id)) {
    throw createError({ statusCode: 404, statusMessage: 'Track not found' })
  }
  return sendNoContent(event)
})
