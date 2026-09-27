import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { addToQueue } from '../lib/queue'
import { getTrack } from '../lib/tracks'

/**
 * Appends a Queue Entry: a Track, and optionally who will sing it. A Track
 * that is separating can be queued — its entry says how far along it is — but
 * one that has not imported cannot be sung at all.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ trackId?: unknown, singerName?: unknown }>(event)
  if (typeof body?.trackId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Say which Track to queue' })
  }
  const singerName = body.singerName
  if (singerName !== undefined && singerName !== null && typeof singerName !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'A singer\'s name is text' })
  }
  const track = getTrack(event.context.akapela, body.trackId)
  if (!track) {
    throw createError({ statusCode: 404, statusMessage: 'Track not found' })
  }
  if (track.importState !== 'ready') {
    throw createError({ statusCode: 409, statusMessage: 'A Track can be queued once it has imported' })
  }
  const entry = addToQueue(event.context.akapela, { trackId: track.id, singerName })
  setResponseStatus(event, 201)
  return entry
})
