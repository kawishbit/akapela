import { eq } from 'drizzle-orm'
import { SETTINGS_ROW_ID, settings } from '../db/schema'
import { DEFAULT_LYRICS_PROVIDER, LYRICS_PROVIDERS, type LyricsProviderName } from '../../shared/lyrics'
import { cpuCoresFor } from '../../shared/separation'
import {
  DEFAULT_SEPARATION_MODEL,
  SEPARATION_MODEL_NAMES,
  SEPARATION_MODELS,
  type SeparationModelName,
} from './separators/models'
import { ytDlpIsManaged } from './tools'
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
  /** Whether a new recording session starts with echo cancellation, noise suppression, and auto gain on. */
  micProcessingDefault: boolean
  /** Whether a new recording session starts with Monitoring on. */
  monitoringDefault: boolean
  /**
   * Whether this Akapela owns its yt-dlp and can replace it — true on the
   * desktop, false under compose, where the image bakes one in and updating
   * it means rebuilding the image (ADR 0010). What puts the "Update yt-dlp"
   * control on the Settings page, or leaves it off.
   */
  ytDlpUpdatable: boolean
  /** The Separation Model a Separation is asked for with unless it names another. */
  separationModel: SeparationModelName
  /** Every Separation Model there is to choose from, in the order they are shown. */
  separationModels: Array<{ name: SeparationModelName, description: string }>
  /** How many cores a Separation may use: the singer's choice, or all but one, clamped to this machine. */
  cpuCores: number
  /**
   * The machine hosting this Akapela, which is what every Separation choice
   * describes — the server's, when the page is a Connected Desktop App.
   */
  hardware: {
    cores: number
  }
}

/** What a singer may pick: Manual always, plus every remote provider this instance can reach. */
export function availableLyricsProviders(akapela: Akapela): LyricsProviderName[] {
  const reachable = new Set(akapela.lyricsProviders.filter(p => p.available).map(p => p.name))
  return LYRICS_PROVIDERS.filter(name => name === 'manual' || reachable.has(name))
}

/**
 * The row is written only once something is changed, so a fresh install reads
 * the defaults rather than needing a seeded row.
 */
function settingsRow(akapela: Akapela) {
  return akapela.db.select().from(settings).where(eq(settings.id, SETTINGS_ROW_ID)).get()
}

/**
 * The Lyrics Provider a new Track starts out on. A default whose provider has
 * since lost its token would send every new Track to a provider that cannot
 * answer, so it falls back.
 */
export function defaultLyricsProviderOf(akapela: Akapela): LyricsProviderName {
  const chosen = settingsRow(akapela)?.defaultLyricsProvider ?? DEFAULT_LYRICS_PROVIDER
  return availableLyricsProviders(akapela).includes(chosen) ? chosen : DEFAULT_LYRICS_PROVIDER
}

/** The Separation Model a Separation is asked for with when it names none. */
export function defaultSeparationModelOf(akapela: Akapela): SeparationModelName {
  return settingsRow(akapela)?.separationModel ?? DEFAULT_SEPARATION_MODEL
}

/** The singer's choices, and the machine they are choosing for. */
export async function getSettings(akapela: Akapela): Promise<AppSettings> {
  const row = settingsRow(akapela)
  const hardware = await akapela.hardware()
  return {
    defaultLyricsProvider: defaultLyricsProviderOf(akapela),
    lyricsProviders: availableLyricsProviders(akapela),
    micProcessingDefault: row?.micProcessingDefault ?? false,
    monitoringDefault: row?.monitoringDefault ?? false,
    ytDlpUpdatable: ytDlpIsManaged(),
    separationModel: defaultSeparationModelOf(akapela),
    separationModels: SEPARATION_MODEL_NAMES.map(name => ({ name, description: SEPARATION_MODELS[name].description })),
    cpuCores: cpuCoresFor(row?.cpuCores ?? null, hardware.cores),
    hardware: { cores: hardware.cores },
  }
}

/** What a singer may change; any subset, so one control can be saved without resending the others. */
export interface SettingsChanges {
  defaultLyricsProvider?: LyricsProviderName
  micProcessingDefault?: boolean
  monitoringDefault?: boolean
  cpuCores?: number
  separationModel?: SeparationModelName
}

/** Saves whichever choices changed. */
export function saveSettings(akapela: Akapela, changes: SettingsChanges): Promise<AppSettings> {
  const row = { id: SETTINGS_ROW_ID, ...changes, updatedAt: Date.now() }
  akapela.db
    .insert(settings)
    .values(row)
    .onConflictDoUpdate({ target: settings.id, set: row })
    .run()
  return getSettings(akapela)
}
