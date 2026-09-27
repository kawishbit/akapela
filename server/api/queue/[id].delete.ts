import { createError, defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { removeFromQueue } from '../../lib/queue'

/** Takes one entry out of the Queue. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!removeFromQueue(event.context.akapela, id)) {
    throw createError({ statusCode: 404, statusMessage: 'That entry is no longer in the Queue' })
  }
  return sendNoContent(event)
})
