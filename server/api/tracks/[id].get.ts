import { defineEventHandler } from 'h3'
import { requireTrack } from '../../lib/require-track'
import { trackDetail } from '../../lib/tracks'

/** One Track with its Lyrics and its latest job. */
export default defineEventHandler(event => trackDetail(event.context.akapela, requireTrack(event)))
