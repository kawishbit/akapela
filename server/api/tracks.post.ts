import {
  createError,
  defineEventHandler,
  getRequestHeader,
  readBody,
  readMultipartFormData,
  setResponseStatus,
  type H3Event,
} from 'h3'
import { UNSUPPORTED_UPLOAD_MESSAGE, uploadExtension } from '../../shared/upload'
import { INVALID_YOUTUBE_URL_MESSAGE, youtubeVideoId } from '../../shared/youtube'
import { createTrackFromUpload, createTrackFromYoutube, type TrackWithJob } from '../lib/tracks'

/**
 * Create a Track from a Source: either a multipart upload with the audio under
 * the `file` field, or a JSON body `{ url }` naming a YouTube video. Either way
 * the Track comes back at once in importing state with its queued import job.
 */
export default defineEventHandler(async (event) => {
  const contentType = getRequestHeader(event, 'content-type') ?? ''
  const track = contentType.startsWith('multipart/form-data')
    ? await createFromUpload(event)
    : await createFromUrl(event)
  setResponseStatus(event, 201)
  return track
})

async function createFromUpload(event: H3Event): Promise<TrackWithJob> {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file?.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }
  if (!uploadExtension(file.filename)) {
    throw createError({ statusCode: 400, statusMessage: UNSUPPORTED_UPLOAD_MESSAGE })
  }
  return createTrackFromUpload(event.context.presto, {
    filename: file.filename,
    bytes: file.data,
  })
}

async function createFromUrl(event: H3Event): Promise<TrackWithJob> {
  const body: unknown = await readBody(event)
  const url = body && typeof body === 'object' && 'url' in body ? body.url : undefined
  if (typeof url !== 'string' || !youtubeVideoId(url)) {
    throw createError({ statusCode: 400, statusMessage: INVALID_YOUTUBE_URL_MESSAGE })
  }
  return createTrackFromYoutube(event.context.presto, { url })
}
