import { defineEventHandler } from 'h3'
import { listMixesForTake } from '../../../../../lib/mixes'
import { requireTake } from '../../../../../lib/require-take'
import { requireTrack } from '../../../../../lib/require-track'

/** Every Mix of one Take, newest first, each with its render Job. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  const take = requireTake(event, track.id)
  return listMixesForTake(event.context.akapela, take.id)
})
