import { defineEventHandler } from 'h3'
import { jobsBusy } from '../../lib/jobs'

/**
 * Whether anything is queued or running.
 *
 * Asked by the Desktop App before it restarts into an Update: a Separation is
 * minutes of CPU, and restarting mid-run would requeue it and start it again
 * from nothing (ADR 0009's amendment on Updates).
 */
export default defineEventHandler(event => ({ busy: jobsBusy(event.context.akapela) }))
