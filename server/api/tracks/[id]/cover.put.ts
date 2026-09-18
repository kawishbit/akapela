import { createError, defineEventHandler, readMultipartFormData } from 'h3'
import { UNSUPPORTED_COVER_MESSAGE, uploadedCoverExtension } from '../../../lib/cover'
import { requireTrack } from '../../../lib/require-track'
import {
  COVER_TOO_LARGE_MESSAGE,
  COVER_WHILE_IMPORTING_MESSAGE,
  MAX_COVER_BYTES,
  replaceCoverWithUpload,
} from '../../../lib/tracks'

/**
 * Replace a Track's cover art with an image the singer uploads under the
 * `file` field. A file that is not a PNG, JPEG, or WebP, or is too large to be
 * cover art, is refused and the current cover stays; so is any upload while
 * the Track is still importing. Returns the Track.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  if (track.importState === 'importing') {
    throw createError({ statusCode: 409, statusMessage: COVER_WHILE_IMPORTING_MESSAGE })
  }
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file')
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  if (file.data.byteLength > MAX_COVER_BYTES) {
    throw createError({ statusCode: 400, statusMessage: COVER_TOO_LARGE_MESSAGE })
  }
  const ext = uploadedCoverExtension(file.data)
  if (!ext) {
    throw createError({ statusCode: 400, statusMessage: UNSUPPORTED_COVER_MESSAGE })
  }
  return replaceCoverWithUpload(event.context.akapela, track, file.data, ext)
})
