import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { renameQueueEntry } from '../../lib/queue'

/** Changes who is singing an entry, for the typo or the person who arrived. Blank clears it. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ singerName?: unknown }>(event)
  const singerName = body?.singerName
  if (singerName !== undefined && singerName !== null && typeof singerName !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'A singer\'s name is text' })
  }
  const entry = renameQueueEntry(event.context.akapela, id, singerName)
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'That entry is no longer in the Queue' })
  }
  return entry
})
