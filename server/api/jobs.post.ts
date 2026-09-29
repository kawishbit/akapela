import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { enqueueJob, isJobType } from '../lib/jobs'
import { apiError } from '../lib/api-error'
import { failure } from '../../shared/error-codes'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ type?: unknown, targetId?: unknown }>(event)
  if (!isJobType(body?.type)) {
    throw apiError(400, failure('invalidRequest'), 'Unknown job type')
  }
  const targetId = typeof body.targetId === 'string' ? body.targetId : null
  const job = enqueueJob(event.context.akapela, { type: body.type, targetId })
  setResponseStatus(event, 201)
  return job
})
