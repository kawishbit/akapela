import type { AppSettings } from '~~/server/lib/settings'
import { DEFAULT_LYRICS_PROVIDER, type LyricsProviderName } from '~~/shared/lyrics'

/**
 * The choices that apply to every Track, and the Lyrics Providers this Akapela
 * can offer. Fetched once per app load and shared, since every Track page asks
 * the same question: which providers are there, and which one is the default.
 */
export function useSettings() {
  /** What the page shows before the server has answered: the provider that needs no account. */
  const beforeLoaded: AppSettings = {
    defaultLyricsProvider: DEFAULT_LYRICS_PROVIDER,
    lyricsProviders: [DEFAULT_LYRICS_PROVIDER, 'manual'],
  }

  const { data, refresh } = useAsyncData<AppSettings>(
    'settings',
    () => $fetch<AppSettings>('/api/settings'),
    { default: () => beforeLoaded },
  )

  const saving = ref(false)
  const saveError = ref<string | null>(null)

  /** Makes this the Lyrics Provider new Tracks start out on. */
  async function setDefaultLyricsProvider(defaultLyricsProvider: LyricsProviderName) {
    saving.value = true
    saveError.value = null
    try {
      data.value = await $fetch<AppSettings>('/api/settings', {
        method: 'PUT',
        body: { defaultLyricsProvider },
      })
    }
    catch (error) {
      saveError.value = describeError(error)
    }
    finally {
      saving.value = false
    }
  }

  return {
    settings: computed(() => data.value),
    lyricsProviders: computed<LyricsProviderName[]>(() => data.value?.lyricsProviders ?? []),
    defaultLyricsProvider: computed(() => data.value?.defaultLyricsProvider ?? DEFAULT_LYRICS_PROVIDER),
    saving,
    saveError,
    setDefaultLyricsProvider,
    refresh,
  }
}
