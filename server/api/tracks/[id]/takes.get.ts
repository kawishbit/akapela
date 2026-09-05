import { defineEventHandler } from 'h3'
import { requireTrack } from '../../../lib/require-track'
import { listTakes } from '../../../lib/takes'

/** Every Take of a Track, newest first. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  return listTakes(event.context.akapela, track.id)
})
