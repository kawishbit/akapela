import type { AppSettings, SettingsChanges } from '~~/server/lib/settings'
import { DEFAULT_LYRICS_PROVIDER, type LyricsProviderName } from '~~/shared/lyrics'

/**
 * The choices that apply to every Track, and the Lyrics Providers this Akapela
 * can offer. Fetched once per app load and shared, since every Track page asks
 * the same question: which providers are there, and which one is the default.
 */
export function useSettings() {
  /** What the page shows before the server has answered: the provider that needs no account, both toggles off. */
  const beforeLoaded: AppSettings = {
    defaultLyricsProvider: DEFAULT_LYRICS_PROVIDER,
    lyricsProviders: [DEFAULT_LYRICS_PROVIDER, 'manual'],
    micProcessingDefault: false,
    monitoringDefault: false,
    ytDlpUpdatable: false,
  }

  const { data, refresh } = useAsyncData<AppSettings>(
    'settings',
    () => $fetch<AppSettings>('/api/settings'),
    { default: () => beforeLoaded },
  )

  const saving = ref(false)
  const saveError = ref<string | null>(null)

  /** Saves whichever of the three choices changed, and shares the failure or the result with every reader. */
  async function save(changes: SettingsChanges) {
    saving.value = true
    saveError.value = null
    try {
      data.value = await $fetch<AppSettings>('/api/settings', { method: 'PUT', body: changes })
    }
    catch (error) {
      saveError.value = describeError(error)
    }
    finally {
      saving.value = false
    }
  }

  /** Makes this the Lyrics Provider new Tracks start out on. */
  function setDefaultLyricsProvider(defaultLyricsProvider: LyricsProviderName) {
    return save({ defaultLyricsProvider })
  }

  /** Sets whether a new recording session starts with echo cancellation, noise suppression, and auto gain on. */
  function setMicProcessingDefault(micProcessingDefault: boolean) {
    return save({ micProcessingDefault })
  }

  /** Sets whether a new recording session starts with Monitoring on. */
  function setMonitoringDefault(monitoringDefault: boolean) {
    return save({ monitoringDefault })
  }

  return {
    settings: computed(() => data.value),
    lyricsProviders: computed<LyricsProviderName[]>(() => data.value?.lyricsProviders ?? []),
    defaultLyricsProvider: computed(() => data.value?.defaultLyricsProvider ?? DEFAULT_LYRICS_PROVIDER),
    micProcessingDefault: computed(() => data.value?.micProcessingDefault ?? false),
    monitoringDefault: computed(() => data.value?.monitoringDefault ?? false),
    ytDlpUpdatable: computed(() => data.value?.ytDlpUpdatable ?? false),
    saving,
    saveError,
    setDefaultLyricsProvider,
    setMicProcessingDefault,
    setMonitoringDefault,
    refresh,
  }
}
