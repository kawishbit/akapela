import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { addToQueue } from '../lib/queue'
import { getTrack } from '../lib/tracks'
import { apiError } from '../lib/api-error'
import { failure } from '../../shared/error-codes'

/**
 * Appends a Queue Entry: a Track, and optionally who will sing it. A Track
 * that is separating can be queued — its entry says how far along it is — but
 * one that has not imported cannot be sung at all.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ trackId?: unknown, singerName?: unknown }>(event)
  if (typeof body?.trackId !== 'string') {
    throw apiError(400, failure('invalidRequest'), 'Say which Track to queue')
  }
  const singerName = body.singerName
  if (singerName !== undefined && singerName !== null && typeof singerName !== 'string') {
    throw apiError(400, failure('invalidRequest'), 'A singer\'s name is text')
  }
  const track = getTrack(event.context.akapela, body.trackId)
  if (!track) {
    throw apiError(404, failure('trackNotFound'), 'Track not found')
  }
  if (track.importState !== 'ready') {
    throw apiError(409, failure('trackNotImported'), 'A Track can be queued once it has imported')
  }
  const entry = addToQueue(event.context.akapela, { trackId: track.id, singerName })
  setResponseStatus(event, 201)
  return entry
})
