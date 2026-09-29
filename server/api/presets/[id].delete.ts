import { defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { BUILT_IN_PRESET_UNDELETABLE_MESSAGE } from '../../../shared/preset'
import { deletePreset, getPreset } from '../../lib/presets'
import { apiError } from '../../lib/api-error'
import { failure } from '../../../shared/error-codes'

/** Deletes a user Preset. A built-in is rejected with a message saying it ships with the app (story 25). */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const preset = getPreset(event.context.akapela, id)
  if (!preset) throw apiError(404, failure('presetNotFound'), 'Preset not found')
  if (preset.builtIn) throw apiError(409, failure('presetBuiltIn'), BUILT_IN_PRESET_UNDELETABLE_MESSAGE)

  deletePreset(event.context.akapela, id)
  return sendNoContent(event)
})
