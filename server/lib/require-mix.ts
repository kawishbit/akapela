import { getRouterParam, type H3Event } from 'h3'
import type { Mix } from '../db/schema'
import { getMix } from './mixes'
import { apiError } from './api-error'
import { failure } from '../../shared/error-codes'

/** The Mix named by the route's `mixId` parameter on `takeId`, or a 404 when there is none. */
export function requireMix(event: H3Event, takeId: string): Mix {
  const mixId = getRouterParam(event, 'mixId') ?? ''
  const mix = getMix(event.context.akapela, takeId, mixId)
  if (!mix) {
    throw apiError(404, failure('mixNotFound'), 'Mix not found')
  }
  return mix
}
