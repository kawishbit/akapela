import { defineEventHandler } from 'h3'
import { cancelJob, JobActionRefused } from '../../../lib/job-actions'
import { requireJob } from '../../../lib/require-job'
import { apiError } from '../../../lib/api-error'

/** Stops a Job, and puts whatever it was working on back the way it was before it was asked for. */
export default defineEventHandler(async (event) => {
  const job = requireJob(event)
  try {
    return await cancelJob(event.context.akapela, job)
  }
  catch (error) {
    if (error instanceof JobActionRefused) throw apiError(409, error.failure, error.message)
    throw error
  }
})
