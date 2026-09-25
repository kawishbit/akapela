import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { getQueueEntry, moveQueueEntry } from '../../../lib/queue'

/** Moves an entry to a new place in the Queue, counted from the top. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ index?: unknown }>(event)
  if (!Number.isInteger(body?.index)) {
    throw createError({ statusCode: 400, statusMessage: 'Say where in the Queue to move it' })
  }
  if (!moveQueueEntry(event.context.akapela, id, body.index as number)) {
    throw createError({ statusCode: 404, statusMessage: 'That entry is no longer in the Queue' })
  }
  return getQueueEntry(event.context.akapela, id)
})
