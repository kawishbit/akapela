import { getRouterParam, type H3Event } from 'h3'
import { getTrack, type TrackWithJob } from './tracks'
import { apiError } from './api-error'
import { failure } from '../../shared/error-codes'

/** The Track named by the route's `id` parameter, or a 404 when there is none. */
export function requireTrack(event: H3Event): TrackWithJob {
  const id = getRouterParam(event, 'id') ?? ''
  const track = getTrack(event.context.akapela, id)
  if (!track) {
    throw apiError(404, failure('trackNotFound'), 'Track not found')
  }
  return track
}
