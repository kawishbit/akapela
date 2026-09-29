import { defineEventHandler, getQuery } from 'h3'
import { INVALID_BACKING_SOURCE_MESSAGE, parseBackingSource } from '../../../../shared/backing-source'
import { sendFile } from '../../../lib/files'
import { requireTrack } from '../../../lib/require-track'
import { audioContentType } from '../../../lib/audio-files'
import { backingTrackPath } from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/**
 * The Backing Track, in whichever Audio Format it was stored, with range support so the browser can seek and decode
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
    throw apiError(400, failure('invalidRequest'), INVALID_BACKING_SOURCE_MESSAGE)
  }
  const path = backingTrackPath(event.context.akapela, track, source)
  return sendFile(event, path, audioContentType(path))
})
