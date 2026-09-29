import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { getQueueEntry, moveQueueEntry } from '../../../lib/queue'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/** Moves an entry to a new place in the Queue, counted from the top. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ index?: unknown }>(event)
  if (!Number.isInteger(body?.index)) {
    throw apiError(400, failure('invalidRequest'), 'Say where in the Queue to move it')
  }
  if (!moveQueueEntry(event.context.akapela, id, body.index as number)) {
    throw apiError(404, failure('queueEntryGone'), 'That entry is no longer in the Queue')
  }
  return getQueueEntry(event.context.akapela, id)
})
