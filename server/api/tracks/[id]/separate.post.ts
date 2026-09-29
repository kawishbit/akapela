import { defineEventHandler, readBody } from 'h3'
import { requireTrack } from '../../../lib/require-track'
import { INVALID_SEPARATION_MODEL_MESSAGE, isSeparationModelName } from '../../../lib/separators/models'
import { startSeparation } from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/**
 * Enqueue vocal removal on a Track. Asked for per Track rather than done on
 * every import, because separation is minutes of CPU and a Track imported from
 * a karaoke video needs none of it. A Track that already has Stems may be
 * separated again — that is the escape hatch when a better model lands — so the
 * only state that refuses is a separation already under way.
 *
 * `separationModel` names the Separation Model to run; left out, it is the
 * default in Settings at this moment, and stays that even if the default
 * changes before the Separation starts.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  if (track.importState !== 'ready') {
    throw apiError(409, failure('trackNotImported'), 'A Track can only be separated once it has imported')
  }
  if (track.separationState === 'separating') {
    throw apiError(409, failure('alreadySeparating'), 'This Track is already separating')
  }
  const body = (await readBody(event).catch(() => null)) as { separationModel?: unknown } | null
  const requested = body?.separationModel
  if (requested !== undefined && !isSeparationModelName(requested)) {
    throw apiError(400, failure('invalidRequest'), INVALID_SEPARATION_MODEL_MESSAGE)
  }
  return startSeparation(event.context.akapela, track, requested)
})
