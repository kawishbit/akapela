import { createError, defineEventHandler, readBody } from 'h3'
import { INVALID_MANUAL_LYRICS_MESSAGE } from '../../../../shared/lyrics'
import { requireTrack } from '../../../lib/require-track'
import { saveManualLyrics } from '../../../lib/track-lyrics'

/**
 * Put the Lyrics the singer typed on this Track. The body is `{ text }`, one
 * line per line sung, whether it was pasted whole or edited from what a
 * provider returned; either way the Lyrics become Manual.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const body = (await readBody(event)) as { text?: unknown } | null
  try {
    return saveManualLyrics(event.context.presto, track, body?.text)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: INVALID_MANUAL_LYRICS_MESSAGE })
  }
})
