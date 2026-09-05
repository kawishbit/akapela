import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { enqueueJob, isJobType } from '../lib/jobs'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ type?: unknown, targetId?: unknown }>(event)
  if (!isJobType(body?.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown job type' })
  }
  const targetId = typeof body.targetId === 'string' ? body.targetId : null
  const job = enqueueJob(event.context.akapela, { type: body.type, targetId })
  setResponseStatus(event, 201)
  return job
})
