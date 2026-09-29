import { getRouterParam, type H3Event } from 'h3'
import type { Take } from '../db/schema'
import { getTake } from './takes'
import { apiError } from './api-error'
import { failure } from '../../shared/error-codes'

/** The Take named by the route's `takeId` parameter on `trackId`, or a 404 when there is none. */
export function requireTake(event: H3Event, trackId: string): Take {
  const takeId = getRouterParam(event, 'takeId') ?? ''
  const take = getTake(event.context.akapela, trackId, takeId)
  if (!take) {
    throw apiError(404, failure('takeNotFound'), 'Take not found')
  }
  return take
}
