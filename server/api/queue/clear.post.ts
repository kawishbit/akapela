import { defineEventHandler } from 'h3'
import { clearQueue } from '../../lib/queue'

/** Empties the Queue. */
export default defineEventHandler(event => ({ cleared: clearQueue(event.context.akapela) }))
