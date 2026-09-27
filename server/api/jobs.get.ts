import { defineEventHandler } from 'h3'
import { listJobs } from '../lib/job-actions'

/** Every Job worth a row on the Jobs page, each named by its Track (and, for a Mix, its Take). */
export default defineEventHandler(event => listJobs(event.context.akapela))
