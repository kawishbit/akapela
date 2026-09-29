import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { INVALID_PRESET_MESSAGE, parsePresetCreate } from '../../shared/preset'
import { createPreset } from '../lib/presets'
import { apiError } from '../lib/api-error'
import { CodedError, failure } from '../../shared/error-codes'

/** Saves the submitted Adjustments under a name. The body is `{ name, adjustments }`. */
export default defineEventHandler(async (event) => {
  let input
  try {
    input = parsePresetCreate(await readBody(event))
  }
  catch (e) {
    throw apiError(400, failure('invalidRequest'), e instanceof Error ? e.message : INVALID_PRESET_MESSAGE)
  }
  let preset
  try {
    preset = createPreset(event.context.akapela, input)
  }
  catch (e) {
    // Only a name already taken is the singer's to fix; anything else is a 500.
    if (e instanceof CodedError && e.code === 'presetNameTaken') throw apiError(409, e.failure, e.message)
    throw e
  }
  setResponseStatus(event, 201)
  return preset
})
