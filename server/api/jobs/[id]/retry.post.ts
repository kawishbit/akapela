import { createError, defineEventHandler } from 'h3'
import { JobActionRefused, retryJob } from '../../../lib/job-actions'
import { requireJob } from '../../../lib/require-job'

/** Asks again for what a failed Job was doing. Answers with the new Job; the failed one keeps its error. */
export default defineEventHandler((event) => {
  const job = requireJob(event)
  try {
    return retryJob(event.context.akapela, job)
  }
  catch (error) {
    if (error instanceof JobActionRefused) throw createError({ statusCode: 409, statusMessage: error.message })
    throw error
  }
})
