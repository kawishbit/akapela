import { join } from 'node:path'
import { createError, defineEventHandler } from 'h3'
import { sendFile } from '../../../lib/files'
import { requireTrack } from '../../../lib/require-track'
import { trackDir } from '../../../lib/tracks'

const COVER_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/** The Track's cover art, read from its directory on the data volume. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  if (!track.coverPath) {
    throw createError({ statusCode: 404, statusMessage: 'Cover not found' })
  }
  const ext = track.coverPath.split('.').pop()?.toLowerCase() ?? ''
  const type = COVER_TYPES[ext] ?? 'application/octet-stream'
  return sendFile(event, join(trackDir(event.context.presto, track.id), track.coverPath), type)
})
