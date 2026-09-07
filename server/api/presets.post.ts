import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { INVALID_PRESET_MESSAGE, parsePresetCreate } from '../../shared/preset'
import { createPreset } from '../lib/presets'

/** Saves the submitted Adjustments under a name. The body is `{ name, adjustments }`. */
export default defineEventHandler(async (event) => {
  let input
  try {
    input = parsePresetCreate(await readBody(event))
  }
  catch (e) {
    throw createError({ statusCode: 400, statusMessage: e instanceof Error ? e.message : INVALID_PRESET_MESSAGE })
  }
  let preset
  try {
    preset = createPreset(event.context.akapela, input)
  }
  catch (e) {
    throw createError({ statusCode: 409, statusMessage: e instanceof Error ? e.message : 'Could not save Preset' })
  }
  setResponseStatus(event, 201)
  return preset
})
