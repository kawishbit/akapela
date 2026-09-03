import { createError, defineEventHandler, readMultipartFormData, setResponseStatus } from 'h3'
import { UNSUPPORTED_UPLOAD_MESSAGE, uploadExtension } from '../../shared/upload'
import { createTrackFromUpload } from '../lib/tracks'

/** Create a Track from a multipart upload with the audio under the `file` field. */
export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file?.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  if (!uploadExtension(file.filename)) {
    throw createError({ statusCode: 400, statusMessage: UNSUPPORTED_UPLOAD_MESSAGE })
  }
  const track = createTrackFromUpload(event.context.presto, {
    filename: file.filename,
    bytes: file.data,
  })
  setResponseStatus(event, 201)
  return track
})
