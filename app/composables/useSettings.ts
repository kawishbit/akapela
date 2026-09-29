import type { AppSettings, SettingsChanges } from '~~/server/lib/settings'
import { DEFAULT_LYRICS_PROVIDER, type LyricsProviderName } from '~~/shared/lyrics'
import { DEFAULT_SEPARATION_MODEL, type SeparationModelName } from '~~/server/lib/separators/models'
import { DEFAULT_AUDIO_FORMAT, type AudioFormat } from '~~/shared/audio-format'
import type { ErrorText } from '~/utils/errors'

/**
 * The choices that apply to every Track, and the Lyrics Providers this Akapela
 * can offer. Fetched once per app load and shared, since every Track page asks
 * the same question: which providers are there, and which one is the default.
 */
export function useSettings() {
  const { t } = useI18n()
  /** What the page shows before the server has answered: the provider that needs no account, both toggles off. */
  const beforeLoaded: AppSettings = {
    defaultLyricsProvider: DEFAULT_LYRICS_PROVIDER,
    lyricsProviders: [DEFAULT_LYRICS_PROVIDER, 'manual'],
    micProcessingDefault: false,
    monitoringDefault: false,
    ytDlpUpdatable: false,
    separationModel: DEFAULT_SEPARATION_MODEL,
    separationModels: [],
    audioFormat: DEFAULT_AUDIO_FORMAT,
    audioFormats: [DEFAULT_AUDIO_FORMAT],
    cpuCores: 1,
    hardware: { cores: 1, gpu: null },
    hardwareAcceleration: true,
  }

  const { data, refresh } = useAsyncData<AppSettings>(
    'settings',
    () => $fetch<AppSettings>('/api/settings'),
    { default: () => beforeLoaded },
  )

  const saving = ref(false)
  const saveError = ref<ErrorText | null>(null)

  /** Saves whichever of the three choices changed, and shares the failure or the result with every reader. */
  async function save(changes: SettingsChanges) {
    saving.value = true
    saveError.value = null
    try {
      data.value = await $fetch<AppSettings>('/api/settings', { method: 'PUT', body: changes })
    }
    catch (error) {
      saveError.value = describeError(error, t)
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

  /** The Separation Model a Separation is asked for with from now on; those already asked for keep theirs. */
  function setSeparationModel(separationModel: SeparationModelName) {
    return save({ separationModel })
  }

  /** What masters and Stems written from now on are stored as; files already written keep theirs. */
  function setAudioFormat(audioFormat: AudioFormat) {
    return save({ audioFormat })
  }

  /** Whether a Separation runs on the GPU, from the next one to start. */
  function setHardwareAcceleration(hardwareAcceleration: boolean) {
    return save({ hardwareAcceleration })
  }

  /** How many cores a Separation may use, from the next one to start. */
  function setCpuCores(cpuCores: number) {
    return save({ cpuCores })
  }

  return {
    settings: computed(() => data.value),
    lyricsProviders: computed<LyricsProviderName[]>(() => data.value?.lyricsProviders ?? []),
    defaultLyricsProvider: computed(() => data.value?.defaultLyricsProvider ?? DEFAULT_LYRICS_PROVIDER),
    micProcessingDefault: computed(() => data.value?.micProcessingDefault ?? false),
    monitoringDefault: computed(() => data.value?.monitoringDefault ?? false),
    ytDlpUpdatable: computed(() => data.value?.ytDlpUpdatable ?? false),
    separationModel: computed(() => data.value?.separationModel ?? DEFAULT_SEPARATION_MODEL),
    separationModels: computed(() => data.value?.separationModels ?? []),
    audioFormat: computed(() => data.value?.audioFormat ?? DEFAULT_AUDIO_FORMAT),
    audioFormats: computed(() => data.value?.audioFormats ?? [DEFAULT_AUDIO_FORMAT]),
    cpuCores: computed(() => data.value?.cpuCores ?? 1),
    hardware: computed(() => data.value?.hardware ?? beforeLoaded.hardware),
    hardwareAcceleration: computed(() => data.value?.hardwareAcceleration ?? true),
    saving,
    saveError,
    setDefaultLyricsProvider,
    setMicProcessingDefault,
    setMonitoringDefault,
    setSeparationModel,
    setCpuCores,
    setHardwareAcceleration,
    setAudioFormat,
    refresh,
  }
}
