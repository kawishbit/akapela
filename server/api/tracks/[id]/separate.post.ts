import { createError, defineEventHandler } from 'h3'
import { requireTrack } from '../../../lib/require-track'
import { startSeparation } from '../../../lib/tracks'

/**
 * Enqueue vocal removal on a Track. Asked for per Track rather than done on
 * every import, because separation is minutes of CPU and a Track imported from
 * a karaoke video needs none of it. A Track that already has Stems may be
 * separated again — that is the escape hatch when a better model lands — so the
 * only state that refuses is a separation already under way.
 */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  if (track.importState !== 'ready') {
    throw createError({ statusCode: 409, statusMessage: 'A Track can only be separated once it has imported' })
  }
  if (track.separationState === 'separating') {
    throw createError({ statusCode: 409, statusMessage: 'This Track is already separating' })
  }
  return startSeparation(event.context.akapela, track)
})
