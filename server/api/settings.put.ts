import { createError, defineEventHandler, readBody } from 'h3'
import {
  INVALID_LYRICS_PROVIDER_MESSAGE,
  parseLyricsProviderName,
  unavailableProviderMessage,
} from '../../shared/lyrics'
import { availableLyricsProviders, saveSettings } from '../lib/settings'

/**
 * Save the choices that apply to every Track. The body is `{ defaultLyricsProvider }`,
 * the Lyrics Provider new Tracks start out looking their Lyrics up in.
 */
export default defineEventHandler(async (event) => {
  const akapela = event.context.akapela
  const body = (await readBody(event)) as { defaultLyricsProvider?: unknown } | null

  let defaultLyricsProvider
  try {
    defaultLyricsProvider = parseLyricsProviderName(body?.defaultLyricsProvider)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: INVALID_LYRICS_PROVIDER_MESSAGE })
  }
  if (!availableLyricsProviders(akapela).includes(defaultLyricsProvider)) {
    throw createError({ statusCode: 400, statusMessage: unavailableProviderMessage(defaultLyricsProvider) })
  }

  return saveSettings(akapela, { defaultLyricsProvider })
})
