import { createError, getRouterParam, type H3Event } from 'h3'
import type { Take } from '../db/schema'
import { getTake } from './takes'

/** The Take named by the route's `takeId` parameter on `trackId`, or a 404 when there is none. */
export function requireTake(event: H3Event, trackId: string): Take {
  const takeId = getRouterParam(event, 'takeId') ?? ''
  const take = getTake(event.context.presto, trackId, takeId)
  if (!take) {
    throw createError({ statusCode: 404, statusMessage: 'Take not found' })
  }
  return take
}
