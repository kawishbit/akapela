import { createError, defineEventHandler, getRouterParam } from 'h3'
import { getJob } from '../../lib/jobs'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const job = getJob(event.context.akapela, id)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  return job
})
