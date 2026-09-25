import { defineEventHandler } from 'h3'
import { clearFinishedJobs } from '../../lib/job-actions'

/** Clears finished Jobs off the Jobs page, keeping any failure a Track still shows the error of. */
export default defineEventHandler(event => ({ cleared: clearFinishedJobs(event.context.akapela) }))
