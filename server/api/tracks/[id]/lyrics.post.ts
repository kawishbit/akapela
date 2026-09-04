import { createError, defineEventHandler, readBody } from 'h3'
import {
  INVALID_LYRICS_PROVIDER_MESSAGE,
  parseLyricsProviderName,
  unavailableProviderMessage,
} from '../../../../shared/lyrics'
import { requireTrack } from '../../../lib/require-track'
import { availableLyricsProviders } from '../../../lib/settings'
import { ManualLyricsOverwriteError, fetchLyricsForTrack } from '../../../lib/track-lyrics'

/**
 * Fetch this Track's Lyrics: `{ provider }` to look them up somewhere else
 * from now on, or an empty body to ask the Track's own provider again. Lyrics
 * the singer typed are only replaced when the body says `overwriteManual`,
 * which is what the page sends once it has asked.
 */
export default defineEventHandler(async (event) => {
  const track = requireTrack(event)
  const presto = event.context.presto
  const body = (await readBody(event)) as { provider?: unknown, overwriteManual?: unknown } | null

  let provider
  if (body?.provider !== undefined) {
    try {
      provider = parseLyricsProviderName(body.provider)
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: INVALID_LYRICS_PROVIDER_MESSAGE })
    }
    if (!availableLyricsProviders(presto).includes(provider)) {
      throw createError({ statusCode: 400, statusMessage: unavailableProviderMessage(provider) })
    }
  }

  try {
    return await fetchLyricsForTrack(presto, track, {
      provider,
      overwriteManual: body?.overwriteManual === true,
    })
  }
  catch (error) {
    if (error instanceof ManualLyricsOverwriteError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
})
