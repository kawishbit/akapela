import { createError, defineEventHandler, readBody } from 'h3'
import { INVALID_LYRICS_OFFSET_MESSAGE, parseLyricsOffset } from '../../../../shared/lyrics'
import { requireTrack } from '../../../lib/require-track'
import { saveLyricsOffset } from '../../../lib/tracks'

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
    throw createError({ statusCode: 400, statusMessage: INVALID_LYRICS_OFFSET_MESSAGE })
  }
  return saveLyricsOffset(event.context.presto, track, offsetMs)
})
