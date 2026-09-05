import { createError, getRouterParam, type H3Event } from 'h3'
import { getTrack, type TrackWithJob } from './tracks'

/** The Track named by the route's `id` parameter, or a 404 when there is none. */
export function requireTrack(event: H3Event): TrackWithJob {
  const id = getRouterParam(event, 'id') ?? ''
  const track = getTrack(event.context.akapela, id)
  if (!track) {
    throw createError({ statusCode: 404, statusMessage: 'Track not found' })
  }
  return track
}
