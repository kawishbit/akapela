import { defineEventHandler, readBody } from 'h3'
import {
  INVALID_BACKING_SOURCE_MESSAGE,
  NO_STEMS_MESSAGE,
  parseBackingSource,
  type BackingSource,
} from '../../../../shared/backing-source'
import { requireTrack } from '../../../lib/require-track'
import { hasStems, saveBackingSource } from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/**
 * Switch what this Track's Backing Track is taken from. The body is
 * `{ backingSource }`. A separation flips it to the Instrumental Stem by
 * itself, so this is mostly the way back: separation is lossy and sometimes
 * loses, and a Track imported from a karaoke video often sounds better on the
 * audio it arrived with than on anything a model extracts from it. The
 * Instrumental Stem is refused on a Track that has none, since the switch would
 * name a file the stream route cannot serve.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const body = (await readBody(event)) as { backingSource?: unknown } | null
  let backingSource: BackingSource
  try {
    backingSource = parseBackingSource(body?.backingSource)
  }
  catch {
    throw apiError(400, failure('invalidRequest'), INVALID_BACKING_SOURCE_MESSAGE)
  }
  if (backingSource === 'instrumental' && !hasStems(event.context.akapela, track)) {
    throw apiError(409, failure('noStems'), NO_STEMS_MESSAGE)
  }
  return saveBackingSource(event.context.akapela, track, backingSource)
})
