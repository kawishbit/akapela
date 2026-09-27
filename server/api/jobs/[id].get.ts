import { defineEventHandler } from 'h3'
import { requireJob } from '../../lib/require-job'

export default defineEventHandler(event => requireJob(event))
