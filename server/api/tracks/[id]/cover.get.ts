import { join } from 'node:path'
import { createError, defineEventHandler } from 'h3'
import { coverContentType } from '../../../lib/cover'
import { sendFile } from '../../../lib/files'
import { requireTrack } from '../../../lib/require-track'
import { trackDir } from '../../../lib/tracks'

/** The Track's cover art, read from its directory on the data volume. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  if (!track.coverPath) {
    throw createError({ statusCode: 404, statusMessage: 'Cover not found' })
  }
  return sendFile(
    event,
    join(trackDir(event.context.presto, track.id), track.coverPath),
    coverContentType(track.coverPath),
  )
})
