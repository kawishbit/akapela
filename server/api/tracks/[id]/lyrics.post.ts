import { defineEventHandler, readBody } from 'h3'
import {
  INVALID_LYRICS_PROVIDER_MESSAGE,
  LYRICS_PROVIDER_LABELS,
  parseLyricsProviderName,
  unavailableProviderMessage,
} from '../../../../shared/lyrics'
import { requireTrack } from '../../../lib/require-track'
import { availableLyricsProviders } from '../../../lib/settings'
import { ManualLyricsOverwriteError, fetchLyricsForTrack } from '../../../lib/track-lyrics'
import { apiError } from '../../../lib/api-error'
import { failure } from '../../../../shared/error-codes'

/**
 * Fetch this Track's Lyrics: `{ provider }` to look them up somewhere else
 * from now on, or an empty body to ask the Track's own provider again. Lyrics
 * the singer typed are only replaced when the body says `overwriteManual`,
 * which is what the page sends once it has asked.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const akapela = event.context.akapela
  const body = (await readBody(event)) as { provider?: unknown, overwriteManual?: unknown } | null

  let provider
  if (body?.provider !== undefined) {
    try {
      provider = parseLyricsProviderName(body.provider)
    }
    catch {
      throw apiError(400, failure('invalidRequest'), INVALID_LYRICS_PROVIDER_MESSAGE)
    }
    if (!availableLyricsProviders(akapela).includes(provider)) {
      throw apiError(400, failure('lyricsProviderUnavailable', { provider: LYRICS_PROVIDER_LABELS[provider] }), unavailableProviderMessage(provider))
    }
  }

  try {
    return await fetchLyricsForTrack(akapela, track, {
      provider,
      overwriteManual: body?.overwriteManual === true,
    })
  }
  catch (error) {
    if (error instanceof ManualLyricsOverwriteError) {
      throw apiError(409, failure('manualLyricsOverwrite'), error.message)
    }
    throw error
  }
})
