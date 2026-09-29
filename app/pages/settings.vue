<script setup lang="ts">
import { ArrowLeft, CloudDownload, CloudUpload, Cpu, Gauge, ExternalLink, FolderOpen, Headphones, Loader2, Minus, Monitor, Moon, Plus, RefreshCw, Search, Settings2, Sun } from 'lucide-vue-next'
import type { LyricsProviderName } from '~~/shared/lyrics'
import { AUDIO_FORMAT_LABELS } from '~~/shared/audio-format'
import { RELEASES_URL } from '~/utils/update-prompt'
import { THEME_PREFERENCES, type ThemePreference } from '~/utils/theme'
import { LANGUAGES, LANGUAGE_NAMES } from '~/utils/language'
import type { ErrorText } from '~/utils/errors'

const { t, locale } = useI18n()

const {
  lyricsProviders,
  defaultLyricsProvider,
  micProcessingDefault,
  monitoringDefault,
  ytDlpUpdatable,
  cpuCores,
  hardware,
  separationModel,
  separationModels,
  hardwareAcceleration,
  audioFormat,
  audioFormats,
  saving,
  saveError,
  setDefaultLyricsProvider,
  setMicProcessingDefault,
  setMonitoringDefault,
  setCpuCores,
  setSeparationModel,
  setAudioFormat,
  setHardwareAcceleration,
  refresh: refreshSettings,
} = useSettings()

// The settings are fetched once per app load, and a Separation since then may
// have downloaded a Separation Model, so ask again for what's downloaded now.
onMounted(() => void refreshSettings())

/** Whose hardware every Separation choice is about — the server's, even from a Connected Desktop App. */
const hardwareLine = computed(() => {
  const { cores, gpu } = hardware.value
  const gpuPart = gpu ? t('settings.separation.gpu', { name: gpu }) : t('settings.separation.noGpu')
  return t('settings.separation.hardware', { cores, gpu: gpuPart }, cores)
})

const { isDesktop, version: desktopVersion, libraryDir, chooseLibraryDir, revealLibraryDir, openExternal } = useDesktop()
const {
  offer: availableUpdate,
  checking: checkingForUpdate,
  lastCheck: updateCheck,
  automatic: automaticUpdateChecks,
  checkNow: checkForUpdateNow,
  setAutomatic: setAutomaticUpdateChecks,
} = useUpdates()

const { preference: themePreference, setPreference: setThemePreference } = useTheme()
const { preference: languagePreference, setPreference: setLanguagePreference } = useLanguage()
const LANGUAGE_OPTIONS = ['automatic', ...LANGUAGES] as const

const THEME_PREFERENCE_ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

function pickDefaultLyricsProvider(provider: LyricsProviderName) {
  if (provider === defaultLyricsProvider.value) return
  setDefaultLyricsProvider(provider)
}

const restoreInput = ref<HTMLInputElement | null>(null)
const pendingRestoreFile = ref<File | null>(null)
const restoring = ref(false)
const restarting = ref(false)
const restoreError = ref<ErrorText | null>(null)

function pickRestoreFile() {
  restoreInput.value?.click()
}

function onRestoreFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared right away so choosing the same file a second time (after
  // cancelling the confirm dialog, say) still fires this handler.
  input.value = ''
  if (file) {
    pendingRestoreFile.value = file
    restoreError.value = null
  }
}

async function confirmRestore() {
  const file = pendingRestoreFile.value
  if (!file) return
  restoring.value = true
  restoreError.value = null
  try {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('confirm', 'true')
    await $fetch('/api/backup/restore', { method: 'POST', body: form })
    pendingRestoreFile.value = null
    restoring.value = false
    restarting.value = true
    await waitForRestart()
    window.location.reload()
  }
  catch (error) {
    restoreError.value = describeError(error, t)
    restoring.value = false
  }
}

/**
 * The app process exits shortly after answering the restore request (see
 * `server/api/backup/restore.post.ts`), so a request landing in the gap
 * before it actually restarts is expected to fail — that is what this is
 * waiting out, not an error. `docker compose`'s `restart: unless-stopped`
 * brings a fresh one back within a few seconds; `aspire run`/`pnpm dev`
 * does not restart on its own, which is what the message after two minutes
 * is for.
 */
async function waitForRestart(): Promise<void> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    try {
      const response = await fetch('/api/settings')
      if (response.ok) return
    }
    catch {
      // Still down — the expected state until the new process is listening.
    }
  }
  restoreError.value = errorText(t('settings.backup.notBack'))
  restarting.value = false
}

const changingLibrary = ref(false)
const libraryError = ref<ErrorText | null>(null)

async function pickLibraryFolder() {
  changingLibrary.value = true
  libraryError.value = null
  try {
    const result = await chooseLibraryDir()
    // A dismissed picker is not an error, and neither is picking the folder
    // that is already open. The shell's own reason is English, since its
    // strings aren't translated yet, so it goes under Details.
    if (result && !result.ok && !result.cancelled) {
      libraryError.value = { message: t('settings.library.unusable'), details: result.error ?? null }
    }
  }
  finally {
    changingLibrary.value = false
  }
}

const updatingYtDlp = ref(false)
const ytDlpVersion = ref<string | null>(null)
const ytDlpError = ref<ErrorText | null>(null)

/**
 * The click that replaces a rebuild. yt-dlp breaks every few months because
 * YouTube changes under it, and on the desktop the binary is the app's own —
 * fetched into the library's cache, not baked into an image (ADR 0010).
 */
async function updateYtDlp() {
  updatingYtDlp.value = true
  ytDlpError.value = null
  ytDlpVersion.value = null
  try {
    const { version } = await $fetch<{ version: string }>('/api/tools/yt-dlp', { method: 'POST' })
    ytDlpVersion.value = version
  }
  catch (error) {
    ytDlpError.value = describeError(error, t)
  }
  finally {
    updatingYtDlp.value = false
  }
}

useHead(() => ({ title: t('app.pageTitle', { page: t('settings.title') }) }))
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 pb-36 pt-6 sm:pb-28 sm:pt-8">
    <NuxtLink
      to="/"
      class="mb-4 inline-flex h-11 items-center gap-2 rounded-pill pr-4 text-sm font-bold text-text-muted transition hover:text-text"
    >
      <ArrowLeft class="size-4" />
      {{ t('common.library') }}
    </NuxtLink>

    <h1 class="mb-6 text-2xl font-bold tracking-tight">
      {{ t('settings.title') }}
    </h1>

    <div class="flex flex-col gap-4">
      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.language.heading') }}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.language.body') }}
        </p>
        <!-- Each Language is named in its own words, so a singer who can't
             read the one on screen can still find theirs. -->
        <div
          class="mt-3 flex flex-wrap items-center gap-1 rounded-pill bg-surface-mid p-1"
          role="group"
          :aria-label="t('settings.language.heading')"
        >
          <button
            v-for="option in LANGUAGE_OPTIONS"
            :key="option"
            type="button"
            class="inline-flex h-11 items-center rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition"
            :class="option === languagePreference
              ? 'bg-text text-ground'
              : 'text-text-muted hover:text-text'"
            :aria-pressed="option === languagePreference"
            :lang="option === 'automatic' ? undefined : option"
            @click="setLanguagePreference(option)"
          >
            {{ option === 'automatic' ? t('settings.language.automatic') : LANGUAGE_NAMES[option] }}
          </button>
        </div>
      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.appearance.heading') }}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.appearance.body') }}
        </p>
        <div
          class="mt-3 flex flex-wrap items-center gap-1 rounded-pill bg-surface-mid p-1"
          role="group"
          :aria-label="t('settings.appearance.heading')"
        >
          <button
            v-for="option in THEME_PREFERENCES"
            :key="option"
            type="button"
            class="inline-flex h-11 items-center gap-1.5 rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition"
            :class="option === themePreference
              ? 'bg-text text-ground'
              : 'text-text-muted hover:text-text'"
            :aria-pressed="option === themePreference"
            @click="setThemePreference(option)"
          >
            <component
              :is="THEME_PREFERENCE_ICONS[option]"
              class="size-3.5"
            />
            {{ t(`settings.appearance.options.${option}`) }}
          </button>
        </div>
      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.lyricsProvider.heading') }}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.lyricsProvider.body') }}
        </p>
        <div
          class="mt-3 flex flex-wrap items-center gap-1 rounded-pill bg-surface-mid p-1"
          role="group"
          :aria-label="t('settings.lyricsProvider.heading')"
        >
          <button
            v-for="provider in lyricsProviders"
            :key="provider"
            type="button"
            class="inline-flex h-11 items-center gap-1.5 rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
            :class="provider === defaultLyricsProvider
              ? 'bg-text text-ground'
              : 'text-text-muted hover:text-text'"
            :aria-pressed="provider === defaultLyricsProvider"
            :disabled="saving"
            @click="pickDefaultLyricsProvider(provider)"
          >
            {{ t(`lyricsProviders.${provider}`) }}
          </button>
        </div>
      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.recording.heading') }}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.recording.body') }}
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex h-12 items-center gap-1.5 rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
            :class="micProcessingDefault ? 'bg-accent text-accent-ink hover:brightness-110' : 'bg-surface-mid text-text-muted hover:text-text'"
            :aria-pressed="micProcessingDefault"
            :disabled="saving"
            @click="setMicProcessingDefault(!micProcessingDefault)"
          >
            <Settings2 class="size-3.5" />
            {{ micProcessingDefault ? t('settings.recording.processingOn') : t('settings.recording.processingOff') }}
          </button>

          <button
            type="button"
            class="inline-flex h-12 items-center gap-1.5 rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
            :class="monitoringDefault ? 'bg-accent text-accent-ink hover:brightness-110' : 'bg-surface-mid text-text-muted hover:text-text'"
            :aria-pressed="monitoringDefault"
            :disabled="saving"
            @click="setMonitoringDefault(!monitoringDefault)"
          >
            <Headphones class="size-3.5" />
            {{ monitoringDefault ? t('settings.recording.monitoringOn') : t('settings.recording.monitoringOff') }}
          </button>
        </div>
      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.separation.heading') }}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.separation.body') }}
        </p>
        <p class="mt-3 flex items-center gap-2 text-sm font-bold">
          <Cpu class="size-4 shrink-0 text-text-muted" />
          {{ hardwareLine }}
        </p>

        <h3 class="mt-4 text-sm font-bold">
          {{ t('settings.separation.coresHeading') }}
        </h3>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.separation.coresBody') }}
        </p>
        <div class="mt-3 flex items-center gap-2">
          <button
            type="button"
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:text-text-muted disabled:hover:bg-surface-mid"
            :disabled="saving || cpuCores <= 1"
            :aria-label="t('settings.separation.fewerCores')"
            @click="setCpuCores(cpuCores - 1)"
          >
            <Minus class="size-5" />
          </button>
          <output
            class="min-w-24 text-center text-2xl font-bold tabular-nums"
            aria-live="polite"
          >{{ cpuCores }} <span class="text-sm font-normal text-text-muted">{{ t('settings.separation.coresOf', { total: hardware.cores }) }}</span></output>
          <button
            type="button"
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:text-text-muted disabled:hover:bg-surface-mid"
            :disabled="saving || cpuCores >= hardware.cores"
            :aria-label="t('settings.separation.moreCores')"
            @click="setCpuCores(cpuCores + 1)"
          >
            <Plus class="size-5" />
          </button>
        </div>

        <!-- Only where a GPU backend was proven to work here. A Connected
             Desktop App on a laptop with a GPU, pointed at a server with none,
             shows nothing, because the server is what separates. -->
        <template v-if="hardware.gpu">
          <h3 class="mt-4 text-sm font-bold">
            {{ t('settings.separation.accelerationHeading') }}
          </h3>
          <p class="mt-1 text-sm text-text-muted">
            {{ t('settings.separation.accelerationBody') }}
          </p>
          <button
            type="button"
            class="mt-3 inline-flex h-12 items-center gap-1.5 rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
            :class="hardwareAcceleration ? 'bg-accent text-accent-ink hover:brightness-110' : 'bg-surface-mid text-text-muted hover:text-text'"
            :aria-pressed="hardwareAcceleration"
            :disabled="saving"
            @click="setHardwareAcceleration(!hardwareAcceleration)"
          >
            <Gauge class="size-3.5" />
            {{ hardwareAcceleration
              ? t('settings.separation.accelerationOn', { gpu: hardware.gpu })
              : t('settings.separation.accelerationOff', { gpu: hardware.gpu }) }}
          </button>
        </template>

        <h3 class="mt-4 text-sm font-bold">
          {{ t('settings.separation.modelHeading') }}
        </h3>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.separation.modelBody') }}
        </p>
        <div
          class="mt-3 flex flex-col gap-1"
          role="radiogroup"
          :aria-label="t('settings.separation.modelHeading')"
        >
          <button
            v-for="model in separationModels"
            :key="model.name"
            type="button"
            role="radio"
            class="flex min-h-12 flex-col items-start rounded-[6px] px-4 py-2 text-left transition disabled:opacity-60"
            :class="model.name === separationModel ? 'bg-text text-ground' : 'bg-surface-mid text-text hover:bg-card'"
            :aria-checked="model.name === separationModel"
            :disabled="saving"
            @click="model.name !== separationModel && setSeparationModel(model.name)"
          >
            <span class="flex w-full items-baseline justify-between gap-3">
              <span class="text-sm font-bold">{{ model.name }}</span>
              <span
                class="shrink-0 text-xs"
                :class="model.name === separationModel ? 'text-ground/80' : 'text-text-muted'"
              >{{ separationModelAvailability(model, t, locale) }}</span>
            </span>
            <span
              class="text-sm"
              :class="model.name === separationModel ? 'text-ground/80' : 'text-text-muted'"
            >{{ separationModelDescription(model.name, t) }}</span>
          </button>
        </div>

      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.storage.heading') }}
        </h2>
        <h3 class="mt-3 text-sm font-bold">
          {{ t('settings.storage.formatHeading') }}
        </h3>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.storage.formatBody') }}
        </p>
        <div
          class="mt-3 flex flex-col gap-1"
          role="radiogroup"
          :aria-label="t('settings.storage.formatHeading')"
        >
          <button
            v-for="format in audioFormats"
            :key="format"
            type="button"
            role="radio"
            class="flex min-h-12 flex-col items-start rounded-[6px] px-4 py-2 text-left transition disabled:opacity-60"
            :class="format === audioFormat ? 'bg-text text-ground' : 'bg-surface-mid text-text hover:bg-card'"
            :aria-checked="format === audioFormat"
            :disabled="saving"
            @click="format !== audioFormat && setAudioFormat(format)"
          >
            <span class="text-sm font-bold">{{ AUDIO_FORMAT_LABELS[format] }}</span>
            <span
              class="text-sm"
              :class="format === audioFormat ? 'text-ground/80' : 'text-text-muted'"
            >{{ t(`audioFormats.descriptions.${format}`) }}</span>
          </button>
        </div>
      </section>

      <!-- A Connected Desktop App answers an empty folder: its library is on the
           server, so there is nothing here to show or change. -->
      <section
        v-if="isDesktop && libraryDir !== ''"
        class="rounded-[8px] bg-surface p-4 sm:p-5"
      >
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.library.heading') }}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.library.body') }}
        </p>

        <p class="mt-3 break-all rounded-[6px] bg-surface-mid px-3 py-2 font-mono text-sm text-text">
          {{ libraryDir ?? '…' }}
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
            :disabled="changingLibrary"
            @click="pickLibraryFolder"
          >
            <FolderOpen class="size-3.5" />
            {{ t('settings.library.change') }}
          </button>
          <button
            type="button"
            class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
            @click="revealLibraryDir()"
          >
            <ExternalLink class="size-3.5" />
            {{ t('settings.library.reveal') }}
          </button>
        </div>

        <ErrorMessage
          class="mt-3"
          :error="libraryError"
        />
      </section>

      <section
        v-if="ytDlpUpdatable"
        class="rounded-[8px] bg-surface p-4 sm:p-5"
      >
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.ytDlp.heading') }}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.ytDlp.body') }}
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
            :disabled="updatingYtDlp"
            @click="updateYtDlp"
          >
            <Loader2
              v-if="updatingYtDlp"
              class="size-3.5 animate-spin"
            />
            <RefreshCw
              v-else
              class="size-3.5"
            />
            {{ t('settings.ytDlp.update') }}
          </button>
        </div>

        <p
          v-if="ytDlpVersion"
          class="mt-3 text-sm font-bold"
          role="status"
        >
          {{ t('settings.ytDlp.updated', { version: ytDlpVersion }) }}
        </p>
        <ErrorMessage
          class="mt-3"
          :error="ytDlpError"
        />
      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.backup.heading') }}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.backup.body') }}
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <a
            href="/api/backup"
            class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
          >
            <CloudDownload class="size-3.5" />
            {{ t('settings.backup.download') }}
          </a>

          <button
            type="button"
            class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
            :disabled="restoring || restarting"
            @click="pickRestoreFile"
          >
            <CloudUpload class="size-3.5" />
            {{ t('settings.backup.restore') }}
          </button>
          <input
            ref="restoreInput"
            type="file"
            accept=".tar.gz,application/gzip"
            class="hidden"
            @change="onRestoreFileChosen"
          >
        </div>

        <p
          v-if="restarting"
          class="mt-3 flex items-center gap-2 text-sm font-bold"
          role="status"
        >
          <Loader2 class="size-4 shrink-0 animate-spin text-accent" />
          {{ t('settings.backup.restarting') }}
        </p>

        <ErrorMessage
          class="mt-3"
          :error="restoreError"
        />
      </section>

      <section
        v-if="isDesktop"
        class="rounded-[8px] bg-surface p-4 sm:p-5"
      >
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('settings.about.heading') }}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {{ t('settings.about.version', { version: desktopVersion }) }}
        </p>

        <p
          v-if="availableUpdate"
          class="mt-3 text-sm"
        >
          {{ t('settings.about.available', { version: availableUpdate.version }) }}
          <button
            type="button"
            class="font-bold underline underline-offset-2 hover:text-accent"
            @click="openExternal(availableUpdate.url)"
          >
            {{ t('settings.about.whatsNew') }}
          </button>
          <button
            type="button"
            class="font-bold underline underline-offset-2 hover:text-accent"
            @click="openExternal(RELEASES_URL)"
          >
            {{ t('settings.about.openDownloadPage') }}
          </button>
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex h-12 items-center gap-1.5 rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
            :class="automaticUpdateChecks ? 'bg-accent text-accent-ink hover:brightness-110' : 'bg-surface-mid text-text-muted hover:text-text'"
            :aria-pressed="automaticUpdateChecks"
            @click="setAutomaticUpdateChecks(!automaticUpdateChecks)"
          >
            <CloudDownload class="size-3.5" />
            {{ automaticUpdateChecks ? t('settings.about.checkOnLaunchOn') : t('settings.about.checkOnLaunchOff') }}
          </button>

          <button
            type="button"
            class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
            :disabled="checkingForUpdate"
            @click="checkForUpdateNow"
          >
            <Loader2
              v-if="checkingForUpdate"
              class="size-3.5 animate-spin"
            />
            <Search
              v-else
              class="size-3.5"
            />
            {{ t('settings.about.checkNow') }}
          </button>
        </div>

        <p class="mt-2 text-sm text-text-muted">
          {{ t('settings.about.checkingOff') }}
        </p>

        <p
          v-if="updateCheck?.state === 'current'"
          class="mt-3 text-sm text-text-muted"
          role="status"
        >
          {{ t('settings.about.current') }}
        </p>
        <p
          v-else-if="updateCheck?.state === 'failed'"
          class="mt-3 text-sm text-negative"
          role="alert"
        >
          <i18n-t
            keypath="settings.about.failed"
            scope="global"
          >
            <template #link>
              <button
                type="button"
                class="font-bold underline underline-offset-2 hover:text-accent"
                @click="openExternal(RELEASES_URL)"
              >
                {{ t('settings.about.releasesPage') }}
              </button>
            </template>
          </i18n-t>
        </p>
      </section>

      <ErrorMessage :error="saveError" />
    </div>

    <ConfirmDialog
      :open="pendingRestoreFile !== null"
      :title="t('settings.backup.confirmTitle')"
      :message="t('settings.backup.confirmMessage', { file: pendingRestoreFile?.name ?? '' })"
      :confirm-label="t('settings.backup.confirm')"
      :busy="restoring"
      @confirm="confirmRestore"
      @cancel="pendingRestoreFile = null"
    />
  </main>
</template>
