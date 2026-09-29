import { defineEventHandler, readMultipartFormData } from 'h3'
import { UNSUPPORTED_COVER_MESSAGE, uploadedCoverExtension } from '../../../lib/cover'
import { requireTrack } from '../../../lib/require-track'
import {
  COVER_TOO_LARGE_MESSAGE,
  COVER_WHILE_IMPORTING_MESSAGE,
  MAX_COVER_BYTES,
  replaceCoverWithUpload,
} from '../../../lib/tracks'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/**
 * Replace a Track's cover art with an image the singer uploads under the
 * `file` field. A file that is not a PNG, JPEG, or WebP, or is too large to be
 * cover art, is refused and the current cover stays; so is any upload while
 * the Track is still importing. Returns the Track.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  if (track.importState === 'importing') {
    throw apiError(409, failure('coverWhileImporting'), COVER_WHILE_IMPORTING_MESSAGE)
  }
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file')
  if (!file) {
    throw apiError(400, failure('noFileUploaded'), 'No file uploaded')
  }
  if (file.data.byteLength > MAX_COVER_BYTES) {
    throw apiError(400, failure('coverTooLarge', { megabytes: MAX_COVER_BYTES / 1024 / 1024 }), COVER_TOO_LARGE_MESSAGE)
  }
  const ext = uploadedCoverExtension(file.data)
  if (!ext) {
    throw apiError(400, failure('unsupportedCover'), UNSUPPORTED_COVER_MESSAGE)
  }
  return replaceCoverWithUpload(event.context.akapela, track, file.data, ext)
})
