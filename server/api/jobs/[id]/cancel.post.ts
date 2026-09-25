import { createError, defineEventHandler } from 'h3'
import { cancelJob, JobActionRefused } from '../../../lib/job-actions'
import { requireJob } from '../../../lib/require-job'

/** Stops a Job, and puts whatever it was working on back the way it was before it was asked for. */
export default defineEventHandler((event) => {
  const job = requireJob(event)
  try {
    return cancelJob(event.context.akapela, job)
  }
  catch (error) {
    if (error instanceof JobActionRefused) throw createError({ statusCode: 409, statusMessage: error.message })
    throw error
  }
})
