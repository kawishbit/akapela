import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { renameQueueEntry } from '../../lib/queue'
import { apiError } from '../../lib/api-error'
import { failure } from '../../../shared/error-codes'

/** Changes who is singing an entry, for the typo or the person who arrived. Blank clears it. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ singerName?: unknown }>(event)
  const singerName = body?.singerName
  if (singerName !== undefined && singerName !== null && typeof singerName !== 'string') {
    throw apiError(400, failure('invalidRequest'), 'A singer\'s name is text')
  }
  const entry = renameQueueEntry(event.context.akapela, id, singerName)
  if (!entry) {
    throw apiError(404, failure('queueEntryGone'), 'That entry is no longer in the Queue')
  }
  return entry
})
