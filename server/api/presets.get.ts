import { defineEventHandler } from 'h3'
import { listPresets } from '../lib/presets'

/** Every Preset, built-ins first, then user Presets newest first. */
export default defineEventHandler(event => listPresets(event.context.akapela))
