import { defineEventHandler, getRouterParam } from 'h3'
import { getQueueEntry, moveQueueEntry } from '../../../lib/queue'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/** Moves an entry to the top of the Queue. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!moveQueueEntry(event.context.akapela, id, 0)) {
    throw apiError(404, failure('queueEntryGone'), 'That entry is no longer in the Queue')
  }
  return getQueueEntry(event.context.akapela, id)
})
