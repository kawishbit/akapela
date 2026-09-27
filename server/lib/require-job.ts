import { createError, getRouterParam, type H3Event } from 'h3'
import type { Job } from '../db/schema'
import { getJob } from './jobs'

/** The Job named by the route's `id` parameter, or a 404 when there is none. */
export function requireJob(event: H3Event): Job {
  const id = getRouterParam(event, 'id') ?? ''
  const job = getJob(event.context.akapela, id)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  return job
}
