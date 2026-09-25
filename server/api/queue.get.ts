import { defineEventHandler } from 'h3'
import { listQueue } from '../lib/queue'

/** The Queue, first up first, each entry with what its row renders. */
export default defineEventHandler(event => listQueue(event.context.akapela))
