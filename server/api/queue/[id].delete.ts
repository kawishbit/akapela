import { defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { removeFromQueue } from '../../lib/queue'
import { apiError } from '../../lib/api-error'
import { failure } from '../../../shared/error-codes'

/** Takes one entry out of the Queue. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!removeFromQueue(event.context.akapela, id)) {
    throw apiError(404, failure('queueEntryGone'), 'That entry is no longer in the Queue')
  }
  return sendNoContent(event)
})
