import { join } from 'node:path'
import { defineEventHandler } from 'h3'
import { sendFile } from '../../../lib/files'
import { requireTrack } from '../../../lib/require-track'
import { BACKING_TRACK_FILE, trackDir } from '../../../lib/tracks'

/** The normalized Backing Track WAV, with range support so the browser can seek and decode it. */
export default defineEventHandler((event) => {
  const track = requireTrack(event)
  return sendFile(event, join(trackDir(event.context.presto, track.id), BACKING_TRACK_FILE), 'audio/wav')
})
