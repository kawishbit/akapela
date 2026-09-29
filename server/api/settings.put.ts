import { defineEventHandler, readBody } from 'h3'
import {
  INVALID_LYRICS_PROVIDER_MESSAGE,
  LYRICS_PROVIDER_LABELS,
  parseLyricsProviderName,
  unavailableProviderMessage,
} from '../../shared/lyrics'
import { invalidCpuCoresMessage, parseCpuCores } from '../../shared/separation'
import { INVALID_AUDIO_FORMAT_MESSAGE, isAudioFormat } from '../../shared/audio-format'
import { INVALID_SEPARATION_MODEL_MESSAGE, isSeparationModelName } from '../lib/separators/models'
import { availableLyricsProviders, saveSettings, type SettingsChanges } from '../lib/settings'
import { apiError } from '../lib/api-error'
import { failure } from '../../shared/error-codes'

const NOTHING_TO_SAVE_MESSAGE = 'Nothing to save.'
const INVALID_MIC_PROCESSING_DEFAULT_MESSAGE = 'The microphone processing default is true or false.'
const INVALID_MONITORING_DEFAULT_MESSAGE = 'The Monitoring default is true or false.'
const INVALID_HARDWARE_ACCELERATION_MESSAGE = 'Hardware acceleration is true or false.'

/**
 * Save whichever of the singer's choices changed: the default Lyrics
 * Provider, the microphone processing default, the Monitoring default, the
 * default Separation Model, how many cores a Separation may use, and the
 * Audio Format new masters and Stems are stored in, and whether a Separation
 * uses the GPU.
 * Each is optional, so a control can be saved on its own without resending
 * the others.
 */
export default defineEventHandler(async (event) => {
  const akapela = event.context.akapela
  const body = (await readBody(event)) as {
    defaultLyricsProvider?: unknown
    micProcessingDefault?: unknown
    monitoringDefault?: unknown
    cpuCores?: unknown
    separationModel?: unknown
    audioFormat?: unknown
    hardwareAcceleration?: unknown
  } | null

  const changes: SettingsChanges = {}

  if (body?.defaultLyricsProvider !== undefined) {
    let defaultLyricsProvider
    try {
      defaultLyricsProvider = parseLyricsProviderName(body.defaultLyricsProvider)
    }
    catch {
      throw apiError(400, failure('invalidRequest'), INVALID_LYRICS_PROVIDER_MESSAGE)
    }
    if (!availableLyricsProviders(akapela).includes(defaultLyricsProvider)) {
      throw apiError(400, failure('lyricsProviderUnavailable', { provider: LYRICS_PROVIDER_LABELS[defaultLyricsProvider] }), unavailableProviderMessage(defaultLyricsProvider))
    }
    changes.defaultLyricsProvider = defaultLyricsProvider
  }

  if (body?.micProcessingDefault !== undefined) {
    if (typeof body.micProcessingDefault !== 'boolean') {
      throw apiError(400, failure('invalidRequest'), INVALID_MIC_PROCESSING_DEFAULT_MESSAGE)
    }
    changes.micProcessingDefault = body.micProcessingDefault
  }

  if (body?.monitoringDefault !== undefined) {
    if (typeof body.monitoringDefault !== 'boolean') {
      throw apiError(400, failure('invalidRequest'), INVALID_MONITORING_DEFAULT_MESSAGE)
    }
    changes.monitoringDefault = body.monitoringDefault
  }

  if (body?.cpuCores !== undefined) {
    const { cores } = await akapela.hardware()
    const cpuCores = parseCpuCores(body.cpuCores, cores)
    if (cpuCores === null) throw apiError(400, failure('invalidRequest'), invalidCpuCoresMessage(cores))
    changes.cpuCores = cpuCores
  }

  if (body?.separationModel !== undefined) {
    if (!isSeparationModelName(body.separationModel)) {
      throw apiError(400, failure('invalidRequest'), INVALID_SEPARATION_MODEL_MESSAGE)
    }
    changes.separationModel = body.separationModel
  }

  if (body?.audioFormat !== undefined) {
    if (!isAudioFormat(body.audioFormat)) {
      throw apiError(400, failure('invalidRequest'), INVALID_AUDIO_FORMAT_MESSAGE)
    }
    changes.audioFormat = body.audioFormat
  }

  if (body?.hardwareAcceleration !== undefined) {
    if (typeof body.hardwareAcceleration !== 'boolean') {
      throw apiError(400, failure('invalidRequest'), INVALID_HARDWARE_ACCELERATION_MESSAGE)
    }
    changes.hardwareAcceleration = body.hardwareAcceleration
  }

  if (Object.keys(changes).length === 0) {
    throw apiError(400, failure('invalidRequest'), NOTHING_TO_SAVE_MESSAGE)
  }

  return saveSettings(akapela, changes)
})
