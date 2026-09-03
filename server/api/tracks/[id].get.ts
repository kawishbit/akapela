import { defineEventHandler } from 'h3'
import { requireTrack } from '../../lib/require-track'

export default defineEventHandler(event => requireTrack(event))
