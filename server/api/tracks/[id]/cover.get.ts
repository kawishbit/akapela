import { join } from 'node:path'
import { defineEventHandler } from 'h3'
import { coverContentType } from '../../../lib/cover'
import { sendFile } from '../../../lib/files'
import { requireTrack } from '../../../lib/require-track'
import { trackDir } from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/** The Track's cover art, read from its directory on the data volume. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  if (!track.coverPath) {
    throw apiError(404, failure('fileNotFound'), 'Cover not found')
  }
  return sendFile(
    event,
    join(trackDir(event.context.akapela, track.id), track.coverPath),
    coverContentType(track.coverPath),
  )
})
