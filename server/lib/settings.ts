import { eq } from 'drizzle-orm'
import { SETTINGS_ROW_ID, settings } from '../db/schema'
import { DEFAULT_LYRICS_PROVIDER, LYRICS_PROVIDERS, type LyricsProviderName } from '../../shared/lyrics'
import type { Akapela } from './akapela'

/**
 * The settings as a page reads them: what the singer has chosen, and the
 * Lyrics Providers this instance can actually offer, so a provider that needs
 * a token nobody configured is never presented as a choice.
 */
export interface AppSettings {
  defaultLyricsProvider: LyricsProviderName
  /** Every Lyrics Provider a Track can be set to here, in the order they are shown. */
  lyricsProviders: LyricsProviderName[]
}

/** What a singer may pick: Manual always, plus every remote provider this instance can reach. */
export function availableLyricsProviders(akapela: Akapela): LyricsProviderName[] {
  const reachable = new Set(akapela.lyricsProviders.filter(p => p.available).map(p => p.name))
  return LYRICS_PROVIDERS.filter(name => name === 'manual' || reachable.has(name))
}

/**
 * The singer's choices. The row is written only once something is changed, so
 * a fresh install reads the defaults rather than needing a seeded row.
 */
export function getSettings(akapela: Akapela): AppSettings {
  const row = akapela.db.select().from(settings).where(eq(settings.id, SETTINGS_ROW_ID)).get()
  const chosen = row?.defaultLyricsProvider ?? DEFAULT_LYRICS_PROVIDER
  const offered = availableLyricsProviders(akapela)
  return {
    // A default whose provider has since lost its token would send every new
    // Track to a provider that cannot answer, so it falls back.
    defaultLyricsProvider: offered.includes(chosen) ? chosen : DEFAULT_LYRICS_PROVIDER,
    lyricsProviders: offered,
  }
}

/** Saves the choices that apply to every Track. */
export function saveSettings(akapela: Akapela, changes: { defaultLyricsProvider: LyricsProviderName }): AppSettings {
  const row = { id: SETTINGS_ROW_ID, ...changes, updatedAt: Date.now() }
  akapela.db
    .insert(settings)
    .values(row)
    .onConflictDoUpdate({ target: settings.id, set: row })
    .run()
  return getSettings(akapela)
}
