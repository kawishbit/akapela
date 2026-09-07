import { createError, defineEventHandler, getQuery } from 'h3'
import { INVALID_BACKING_SOURCE_MESSAGE, parseBackingSource } from '../../../../shared/backing-source'
import { sendFile } from '../../../lib/files'
import { requireTrack } from '../../../lib/require-track'
import { backingTrackPath } from '../../../lib/tracks'

/**
 * The Backing Track WAV, with range support so the browser can seek and decode
 * it. Which file that is comes from the Track's Backing Source, so switching it
 * changes what every player fetches next; `?source=original|instrumental` names
 * one for a single request instead.
 */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  const requested = getQuery(event).source
  let source
  try {
    source = requested === undefined ? track.backingSource : parseBackingSource(requested)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: INVALID_BACKING_SOURCE_MESSAGE })
  }
  return sendFile(event, backingTrackPath(event.context.akapela, track, source), 'audio/wav')
})
