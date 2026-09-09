import { createError, defineEventHandler, readBody } from 'h3'
import {
  INVALID_LYRICS_PROVIDER_MESSAGE,
  parseLyricsProviderName,
  unavailableProviderMessage,
} from '../../shared/lyrics'
import { availableLyricsProviders, saveSettings, type SettingsChanges } from '../lib/settings'

const NOTHING_TO_SAVE_MESSAGE = 'Nothing to save.'
const INVALID_MIC_PROCESSING_DEFAULT_MESSAGE = 'The microphone processing default is true or false.'
const INVALID_MONITORING_DEFAULT_MESSAGE = 'The Monitoring default is true or false.'

/**
 * Save whichever of the singer's choices changed: the default Lyrics
 * Provider, the microphone processing default, and the Monitoring default.
 * Each is optional, so a control can be saved on its own without resending
 * the others.
 */
export default defineEventHandler(async (event) => {
  const akapela = event.context.akapela
  const body = (await readBody(event)) as {
    defaultLyricsProvider?: unknown
    micProcessingDefault?: unknown
    monitoringDefault?: unknown
  } | null

  const changes: SettingsChanges = {}

  if (body?.defaultLyricsProvider !== undefined) {
    let defaultLyricsProvider
    try {
      defaultLyricsProvider = parseLyricsProviderName(body.defaultLyricsProvider)
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: INVALID_LYRICS_PROVIDER_MESSAGE })
    }
    if (!availableLyricsProviders(akapela).includes(defaultLyricsProvider)) {
      throw createError({ statusCode: 400, statusMessage: unavailableProviderMessage(defaultLyricsProvider) })
    }
    changes.defaultLyricsProvider = defaultLyricsProvider
  }

  if (body?.micProcessingDefault !== undefined) {
    if (typeof body.micProcessingDefault !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: INVALID_MIC_PROCESSING_DEFAULT_MESSAGE })
    }
    changes.micProcessingDefault = body.micProcessingDefault
  }

  if (body?.monitoringDefault !== undefined) {
    if (typeof body.monitoringDefault !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: INVALID_MONITORING_DEFAULT_MESSAGE })
    }
    changes.monitoringDefault = body.monitoringDefault
  }

  if (Object.keys(changes).length === 0) {
    throw createError({ statusCode: 400, statusMessage: NOTHING_TO_SAVE_MESSAGE })
  }

  return saveSettings(akapela, changes)
})
