<script setup lang="ts">
import { ArrowLeft, CloudDownload, CloudUpload, ExternalLink, FolderOpen, Headphones, Loader2, Monitor, Moon, RefreshCw, Settings2, Sun } from 'lucide-vue-next'
import { LYRICS_PROVIDER_LABELS, type LyricsProviderName } from '~~/shared/lyrics'
import { THEME_PREFERENCES, THEME_PREFERENCE_LABELS, type ThemePreference } from '~/utils/theme'

const {
  lyricsProviders,
  defaultLyricsProvider,
  micProcessingDefault,
  monitoringDefault,
  ytDlpUpdatable,
  saving,
  saveError,
  setDefaultLyricsProvider,
  setMicProcessingDefault,
  setMonitoringDefault,
} = useSettings()

const { isDesktop, version: desktopVersion, libraryDir, update, chooseLibraryDir, revealLibraryDir, openExternal } = useDesktop()

const { preference: themePreference, setPreference: setThemePreference } = useTheme()

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
const restoreError = ref<string | null>(null)

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
    restoreError.value = describeError(error)
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
  restoreError.value
    = 'The app hasn\'t come back on its own after two minutes. If you\'re running this in development, '
      + 'restart it by hand (`aspire run` or `pnpm dev`) — under `docker compose` it restarts itself.'
  restarting.value = false
}

const changingLibrary = ref(false)
const libraryError = ref<string | null>(null)

async function pickLibraryFolder() {
  changingLibrary.value = true
  libraryError.value = null
  try {
    const result = await chooseLibraryDir()
    // A dismissed picker is not an error, and neither is picking the folder
    // that is already open.
    if (result && !result.ok && !result.cancelled) libraryError.value = result.error ?? 'That folder could not be used.'
  }
  finally {
    changingLibrary.value = false
  }
}

const updatingYtDlp = ref(false)
const ytDlpVersion = ref<string | null>(null)
const ytDlpError = ref<string | null>(null)

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
    ytDlpError.value = describeError(error)
  }
  finally {
    updatingYtDlp.value = false
  }
}

useHead({ title: 'Settings · Akapela' })
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 pb-36 pt-6 sm:pb-28 sm:pt-8">
    <NuxtLink
      to="/"
      class="mb-4 inline-flex h-11 items-center gap-2 rounded-pill pr-4 text-sm font-bold text-text-muted transition hover:text-text"
    >
      <ArrowLeft class="size-4" />
      Library
    </NuxtLink>

    <h1 class="mb-6 text-2xl font-bold tracking-tight">
      Settings
    </h1>

    <div class="flex flex-col gap-4">
      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          Appearance
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          How Akapela looks on this device. "System" follows whatever your OS or browser is set to.
        </p>
        <div
          class="mt-3 flex flex-wrap items-center gap-1 rounded-pill bg-surface-mid p-1"
          role="group"
          aria-label="Appearance"
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
            {{ THEME_PREFERENCE_LABELS[option] }}
          </button>
        </div>
      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          Default Lyrics Provider
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          Where a newly imported Track looks its Lyrics up.
        </p>
        <div
          class="mt-3 flex flex-wrap items-center gap-1 rounded-pill bg-surface-mid p-1"
          role="group"
          aria-label="Default Lyrics Provider"
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
            {{ LYRICS_PROVIDER_LABELS[provider] }}
          </button>
        </div>
      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          Recording
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          What a new recording session on the Sing page starts with. Either can still be
          switched for that session alone.
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
            Processing {{ micProcessingDefault ? 'on' : 'off' }}
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
            Monitoring {{ monitoringDefault ? 'on' : 'off' }}
          </button>
        </div>
      </section>

      <section
        v-if="isDesktop"
        class="rounded-[8px] bg-surface p-4 sm:p-5"
      >
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          Library location
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          The folder holding your database and every Track's files. Choosing another one opens the library
          that's already there — nothing is moved, copied, or deleted at either end. Akapela restarts to
          apply it.
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
            Change folder
          </button>
          <button
            type="button"
            class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
            @click="revealLibraryDir()"
          >
            <ExternalLink class="size-3.5" />
            Show in file manager
          </button>
        </div>

        <p
          v-if="libraryError"
          class="mt-3 text-sm text-negative"
          role="alert"
        >
          {{ libraryError }}
        </p>
      </section>

      <section
        v-if="ytDlpUpdatable"
        class="rounded-[8px] bg-surface p-4 sm:p-5"
      >
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          YouTube imports
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          Importing from YouTube uses yt-dlp, which breaks whenever YouTube changes under it. If imports
          have started failing, fetch the latest version — Akapela keeps its own copy, so this is the whole fix.
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
            Update yt-dlp
          </button>
        </div>

        <p
          v-if="ytDlpVersion"
          class="mt-3 text-sm font-bold"
          role="status"
        >
          Updated to yt-dlp {{ ytDlpVersion }}.
        </p>
        <p
          v-if="ytDlpError"
          class="mt-3 text-sm text-negative"
          role="alert"
        >
          {{ ytDlpError }}
        </p>
      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          Backup
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          Everything that isn't re-downloadable — the database, every Track's audio, every Take
          and Mix. Restoring replaces your entire library with what's in the file.
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <a
            href="/api/backup"
            class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
          >
            <CloudDownload class="size-3.5" />
            Download backup
          </a>

          <button
            type="button"
            class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
            :disabled="restoring || restarting"
            @click="pickRestoreFile"
          >
            <CloudUpload class="size-3.5" />
            Restore from backup
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
          Restored. Waiting for the app to come back…
        </p>

        <p
          v-if="restoreError"
          class="mt-3 text-sm text-negative"
          role="alert"
        >
          {{ restoreError }}
        </p>
      </section>

      <section
        v-if="isDesktop"
        class="rounded-[8px] bg-surface p-4 sm:p-5"
      >
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          About
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          Akapela {{ desktopVersion }}.
        </p>

        <!-- The whole of v1's updating story: a link, never a download. -->
        <p
          v-if="update"
          class="mt-3 text-sm"
        >
          Akapela {{ update.version }} is available.
          <button
            type="button"
            class="font-bold underline underline-offset-2 hover:text-accent"
            @click="openExternal(update.url)"
          >
            Open the download page
          </button>
        </p>
      </section>

      <p
        v-if="saveError"
        class="text-sm text-negative"
        role="alert"
      >
        {{ saveError }}
      </p>
    </div>

    <ConfirmDialog
      :open="pendingRestoreFile !== null"
      title="Restore from backup?"
      :message="`This replaces your entire library — every Track, Take, and Mix — with what's in ${pendingRestoreFile?.name}. This can't be undone, and the app restarts once it's done.`"
      confirm-label="Restore"
      :busy="restoring"
      @confirm="confirmRestore"
      @cancel="pendingRestoreFile = null"
    />
  </main>
</template>
