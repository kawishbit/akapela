import { join } from 'node:path'
import { createError, defineEventHandler, getQuery } from 'h3'
import { sendFile } from '../../../../../../../lib/files'
import { requireMix } from '../../../../../../../lib/require-mix'
import { requireTake } from '../../../../../../../lib/require-take'
import { requireTrack } from '../../../../../../../lib/require-track'
import { trackDir } from '../../../../../../../lib/tracks'

/**
 * A Mix's rendered audio, for in-app playback and for download. `?format=wav`
 * asks for the WAV; anything else (including no query at all) is the MP3,
 * which every Mix has. A 404 covers both "no such Mix" and "that format was
 * never rendered for it".
 */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  const take = requireTake(event, track.id)
  const mix = requireMix(event, take.id)

  const wav = getQuery(event).format === 'wav'
  const relativePath = wav ? mix.wavPath : mix.mp3Path
  if (!relativePath) {
    throw createError({ statusCode: 404, statusMessage: wav ? 'This Mix has no WAV file' : 'This Mix has not finished rendering' })
  }
  return sendFile(event, join(trackDir(event.context.akapela, track.id), relativePath), wav ? 'audio/wav' : 'audio/mpeg')
})
