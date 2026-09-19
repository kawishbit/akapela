import { createError, defineEventHandler, readBody } from 'h3'
import { INVALID_TRACK_DETAILS_MESSAGE, parseTrackDetails, type TrackDetails } from '../../../../shared/track-details'
import { requireTrack } from '../../../lib/require-track'
import { saveTrackDetails } from '../../../lib/tracks'

/**
 * Rename a Track: `{ title, artist }`, the names the library lists it by. The
 * confirmed Song and its Lyrics are untouched. Returns the Track as it now is.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  let details: TrackDetails
  try {
    details = parseTrackDetails(await readBody(event))
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: INVALID_TRACK_DETAILS_MESSAGE })
  }
  return saveTrackDetails(event.context.akapela, track, details)
})
