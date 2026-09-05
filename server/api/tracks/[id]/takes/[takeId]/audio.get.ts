import { join } from 'node:path'
import { defineEventHandler } from 'h3'
import { sendFile } from '../../../../../lib/files'
import { requireTake } from '../../../../../lib/require-take'
import { requireTrack } from '../../../../../lib/require-track'
import { trackDir } from '../../../../../lib/tracks'

/** A Take's dry vocal WAV, range-enabled so the Review screen can decode it like the Backing Track. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  const take = requireTake(event, track.id)
  return sendFile(event, join(trackDir(event.context.akapela, track.id), take.filePath), 'audio/wav')
})
