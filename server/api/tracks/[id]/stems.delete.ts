import { createError, defineEventHandler } from 'h3'
import { requireTrack } from '../../../lib/require-track'
import { deleteStems, hasStems } from '../../../lib/tracks'

/**
 * Removes a Track's two Stems and reclaims their disk space: ADR 0005 puts a
 * pair at about 80 MB, and the Track delete cascade already sweeps that when
 * the whole Track goes, but a singer who wants to keep the Track should not
 * have to delete it to get the space back. Puts the Track back on its
 * original audio, since the Instrumental Stem it may have been singing over
 * no longer exists.
 */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  if (!hasStems(event.context.akapela, track)) {
    throw createError({ statusCode: 409, statusMessage: 'This Track has no Stems to delete' })
  }
  return deleteStems(event.context.akapela, track)
})
