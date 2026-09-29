import { defineEventHandler, getQuery } from 'h3'
import {
  INVALID_BACKING_SOURCE_MESSAGE,
  INVALID_STEM_MESSAGE,
  parseBackingSource,
  parseStem,
  type TrackAudioFile,
} from '../../../../shared/backing-source'
import { sendFile } from '../../../lib/files'
import { requireTrack } from '../../../lib/require-track'
import { audioContentType } from '../../../lib/audio-files'
import { trackAudioPath } from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/**
 * One of the Track's stored audio files, in whichever Audio Format it was
 * stored, with range support so the browser can seek and decode it.
 *
 * `?stem=instrumental|vocals` names one Stem: a Backing Source of `stems` is
 * two files, blended by the player at the Stem Levels, so the browser fetches
 * each one it needs by name. `?source=original|stems` names a Backing Source
 * instead, `stems` standing for its Instrumental Stem. With neither, the
 * Track's own Backing Source is served, so what a plain fetch plays follows
 * the switch.
 */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  const query = getQuery(event)

  let file: TrackAudioFile
  if (query.stem !== undefined) {
    try {
      file = parseStem(query.stem)
    }
    catch {
      throw apiError(400, failure('invalidRequest'), INVALID_STEM_MESSAGE)
    }
  }
  else {
    let source
    try {
      source = query.source === undefined ? track.backingSource : parseBackingSource(query.source)
    }
    catch {
      throw apiError(400, failure('invalidRequest'), INVALID_BACKING_SOURCE_MESSAGE)
    }
    file = source === 'original' ? 'original' : 'instrumental'
  }

  const path = trackAudioPath(event.context.akapela, track, file)
  return sendFile(event, path, audioContentType(path))
})
