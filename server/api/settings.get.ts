import { defineEventHandler } from 'h3'
import { getSettings } from '../lib/settings'

/** The choices that apply to every Track, and the Lyrics Providers this Akapela can offer. */
export default defineEventHandler(event => getSettings(event.context.akapela))
