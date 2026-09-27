import { createError, defineEventHandler, getRouterParam } from 'h3'
import { getQueueEntry, moveQueueEntry } from '../../../lib/queue'

/** Moves an entry to the top of the Queue. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!moveQueueEntry(event.context.akapela, id, 0)) {
    throw createError({ statusCode: 404, statusMessage: 'That entry is no longer in the Queue' })
  }
  return getQueueEntry(event.context.akapela, id)
})
