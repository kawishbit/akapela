import { createError, defineEventHandler, getRouterParam, sendNoContent } from 'h3'
import { BUILT_IN_PRESET_UNDELETABLE_MESSAGE } from '../../../shared/preset'
import { deletePreset, getPreset } from '../../lib/presets'

/** Deletes a user Preset. A built-in is rejected with a message saying it ships with the app (story 25). */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const preset = getPreset(event.context.akapela, id)
  if (!preset) throw createError({ statusCode: 404, statusMessage: 'Preset not found' })
  if (preset.builtIn) throw createError({ statusCode: 409, statusMessage: BUILT_IN_PRESET_UNDELETABLE_MESSAGE })

  deletePreset(event.context.akapela, id)
  return sendNoContent(event)
})
