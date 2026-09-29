import { defineEventHandler, readBody } from 'h3'
import {
  INVALID_BACKING_SOURCE_MESSAGE,
  INVALID_STEM_LEVELS_MESSAGE,
  NO_STEMS_MESSAGE,
  parseBackingSource,
  parseStemLevels,
  type BackingSource,
  type StemLevels,
} from '../../../../shared/backing-source'
import { requireTrack } from '../../../lib/require-track'
import { hasStems, saveBackingSource, saveStemLevels } from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/**
 * Switch what this Track's Backing Track is taken from, and remember its Stem
 * Levels. The body is `{ backingSource?, stemLevels? }`, at least one of the
 * two; whichever is left out, the Track's own stands. A slider saves only the
 * levels, so it can never put back a source switched since it moved.
 *
 * A separation flips the source to Stems by itself, so the switch is mostly
 * the way back: separation is lossy and sometimes loses, and a Track imported
 * from a karaoke video often sounds better on the audio it arrived with than
 * on anything a model extracts from it. Stems are refused on a Track that has
 * none, since the switch would name files the stream route cannot serve;
 * levels are not, and are kept for when it does.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const body = (await readBody(event)) as { backingSource?: unknown, stemLevels?: unknown } | null
  let stemLevels: StemLevels | undefined
  if (body?.stemLevels !== undefined) {
    try {
      stemLevels = parseStemLevels(body.stemLevels)
    }
    catch {
      throw apiError(400, failure('invalidRequest'), INVALID_STEM_LEVELS_MESSAGE)
    }
  }
  // The levels alone: the source is not read from `track`, which may already
  // be out of date by the time the body has arrived.
  if (stemLevels && body?.backingSource === undefined) return saveStemLevels(event.context.akapela, track, stemLevels)

  let backingSource: BackingSource
  try {
    backingSource = parseBackingSource(body?.backingSource)
  }
  catch {
    throw apiError(400, failure('invalidRequest'), INVALID_BACKING_SOURCE_MESSAGE)
  }
  if (backingSource === 'stems' && !hasStems(event.context.akapela, track)) {
    throw apiError(409, failure('noStems'), NO_STEMS_MESSAGE)
  }
  return saveBackingSource(event.context.akapela, track, backingSource, stemLevels)
})
