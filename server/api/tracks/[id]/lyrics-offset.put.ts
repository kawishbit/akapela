import { defineEventHandler, readBody } from 'h3'
import { INVALID_LYRICS_OFFSET_MESSAGE, parseLyricsOffset } from '../../../../shared/lyrics'
import { requireTrack } from '../../../lib/require-track'
import { saveLyricsOffset } from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/**
 * Save the Lyrics Offset that lines this Track's Lyrics up with its Backing
 * Track. The body is `{ offsetMs }`, a whole tenth of a second.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const body = (await readBody(event)) as { offsetMs?: unknown } | null
  let offsetMs: number
  try {
    offsetMs = parseLyricsOffset(body?.offsetMs)
  }
  catch {
    throw apiError(400, failure('invalidRequest'), INVALID_LYRICS_OFFSET_MESSAGE)
  }
  return saveLyricsOffset(event.context.akapela, track, offsetMs)
})
