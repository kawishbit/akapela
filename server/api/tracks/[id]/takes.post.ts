import { createError, defineEventHandler, readMultipartFormData, setResponseStatus } from 'h3'
import { INVALID_TAKE_META_MESSAGE, parseTakeUploadMeta } from '../../../../shared/take'
import { requireTrack } from '../../../lib/require-track'
import { createTake } from '../../../lib/takes'

/**
 * Upload a Take: a multipart body carrying the WAV under `file` and its
 * metadata (start position, duration, Adjustments) as JSON text under `meta`.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'No Take audio uploaded' })
  }
  const metaPart = parts?.find(part => part.name === 'meta')
  let meta
  try {
    meta = parseTakeUploadMeta(metaPart && JSON.parse(metaPart.data.toString('utf-8')))
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: INVALID_TAKE_META_MESSAGE })
  }
  const take = createTake(event.context.akapela, track.id, { ...meta, bytes: file.data })
  setResponseStatus(event, 201)
  return take
})
