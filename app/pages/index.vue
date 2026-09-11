<script setup lang="ts">
import { Link, Loader2, Music2, Plus, Search, Settings, X } from 'lucide-vue-next'
import type { TrackWithJob } from '~~/server/lib/tracks'
import { UNSUPPORTED_UPLOAD_MESSAGE, UPLOAD_ACCEPT, UPLOAD_EXTENSIONS_SENTENCE, uploadExtension } from '~~/shared/upload'
import { INVALID_YOUTUBE_URL_MESSAGE, youtubeVideoId } from '~~/shared/youtube'

const { query, tracks, loading, uploading, uploadError, upload, importUrl, remove, retry } = useLibrary()

const fileInput = ref<HTMLInputElement | null>(null)
const pendingDelete = ref<TrackWithJob | null>(null)
const deleting = ref(false)
const actionError = ref<string | null>(null)

const urlInput = ref<HTMLInputElement | null>(null)
const urlFormOpen = ref(false)
const url = ref('')
const urlError = ref<string | null>(null)
const importingUrl = ref(false)

function pickFiles() {
  fileInput.value?.click()
}

async function onFilesChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length) await upload(files)
}

/**
 * Dropping files on the library.
 *
 * The same import path the file picker uses, with the same validation and the
 * same messages — nothing new on the server, no new Job kind, no new state.
 * Anything unsupported is refused by name rather than silently ignored, and a
 * mixed drop imports none of it rather than importing some and dropping the
 * rest on the floor.
 *
 * Deliberately not here: dock and taskbar drops, and "Open with Akapela" file
 * associations. Both mean a cold start that arrives with a file already in
 * hand, which is real machinery for an affordance nobody asked for.
 */
const dragging = ref(false)
let dragDepth = 0

function onDragEnter(event: DragEvent) {
  if (!event.dataTransfer?.types.includes('Files')) return
  dragDepth++
  dragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

async function onDrop(event: DragEvent) {
  dragDepth = 0
  dragging.value = false
  const items = Array.from(event.dataTransfer?.files ?? [])
  if (!items.length) return

  // A dropped folder arrives as a zero-byte entry with no extension, which
  // `uploadExtension` refuses along with everything else unsupported.
  const refused = items.filter(file => !uploadExtension(file.name))
  if (refused.length) {
    uploadError.value = refused.map(file => `${file.name}: ${UNSUPPORTED_UPLOAD_MESSAGE}`).join('\n')
    return
  }
  await upload(items)
}

async function openUrlForm() {
  urlFormOpen.value = true
  await nextTick()
  urlInput.value?.focus()
}

function closeUrlForm() {
  urlFormOpen.value = false
  url.value = ''
  urlError.value = null
}

async function submitUrl() {
  if (!youtubeVideoId(url.value)) {
    urlError.value = INVALID_YOUTUBE_URL_MESSAGE
    return
  }
  importingUrl.value = true
  urlError.value = null
  try {
    await importUrl(url.value)
    closeUrlForm()
  }
  catch (error) {
    urlError.value = describeError(error)
  }
  finally {
    importingUrl.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  actionError.value = null
  try {
    await remove(pendingDelete.value)
    pendingDelete.value = null
  }
  catch (error) {
    actionError.value = describeError(error)
  }
  finally {
    deleting.value = false
  }
}

async function onRetry(track: TrackWithJob) {
  actionError.value = null
  try {
    await retry(track)
  }
  catch (error) {
    actionError.value = describeError(error)
  }
}
</script>

<template>
  <main
    class="relative mx-auto max-w-6xl px-4 pb-36 pt-6 sm:pb-28 sm:pt-8"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div
      v-if="dragging"
      class="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-[12px] border-2 border-dashed border-accent bg-ground/80"
      aria-hidden="true"
    >
      <p class="text-sm font-bold uppercase tracking-[1.4px] text-text">
        Drop to import
      </p>
    </div>

    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold tracking-tight">
        Your Library
      </h1>
      <div class="flex flex-wrap items-center gap-2">
        <NuxtLink
          to="/settings"
          class="flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
          aria-label="Settings"
        >
          <Settings class="size-5" />
        </NuxtLink>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-pill border border-border-light px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:border-text"
          @click="openUrlForm"
        >
          <Link class="size-4" />
          From YouTube
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110 disabled:opacity-60"
          :disabled="uploading"
          @click="pickFiles"
        >
          <Loader2
            v-if="uploading"
            class="size-4 animate-spin"
          />
          <Plus
            v-else
            class="size-4"
          />
          Import file
        </button>
      </div>
      <input
        ref="fileInput"
        type="file"
        class="sr-only"
        :accept="UPLOAD_ACCEPT"
        multiple
        tabindex="-1"
        @change="onFilesChosen"
      >
    </header>

    <form
      v-if="urlFormOpen"
      class="mb-6 rounded-[8px] bg-surface p-4 shadow-[var(--shadow-medium)]"
      aria-label="Import from YouTube"
      novalidate
      @submit.prevent="submitUrl"
    >
      <label
        for="youtube-url"
        class="mb-2 block text-sm font-bold"
      >
        Paste a YouTube link
      </label>
      <div class="flex flex-col gap-2 sm:flex-row">
        <input
          id="youtube-url"
          ref="urlInput"
          v-model.trim="url"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          placeholder="https://www.youtube.com/watch?v="
          class="min-w-0 flex-1 appearance-none rounded-pill bg-surface-mid px-5 py-3 text-base text-text shadow-[var(--shadow-inset-border)] outline-none placeholder:text-text-muted focus:shadow-[var(--shadow-inset-border),0_0_0_2px_var(--color-text)]"
          :aria-invalid="urlError !== null"
          :aria-describedby="urlError ? 'youtube-url-error' : undefined"
          @keydown.escape="closeUrlForm"
        >
        <div class="flex gap-2">
          <button
            type="submit"
            class="inline-flex flex-1 items-center justify-center gap-2 rounded-pill bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110 disabled:opacity-60 sm:flex-none"
            :disabled="importingUrl || !url"
          >
            <Loader2
              v-if="importingUrl"
              class="size-4 animate-spin"
            />
            <Plus
              v-else
              class="size-4"
            />
            Import
          </button>
          <button
            type="button"
            class="flex size-12 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
            aria-label="Cancel"
            @click="closeUrlForm"
          >
            <X class="size-4" />
          </button>
        </div>
      </div>
      <p
        v-if="urlError"
        id="youtube-url-error"
        class="mt-3 text-sm text-negative"
        role="alert"
      >
        {{ urlError }}
      </p>
    </form>

    <label class="relative mb-6 block">
      <Search class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
      <input
        v-model.trim="query"
        type="search"
        placeholder="Search by title or artist"
        class="w-full appearance-none rounded-pill bg-surface-mid py-3 pl-11 pr-11 text-base text-text shadow-[var(--shadow-inset-border)] outline-none placeholder:text-text-muted focus:shadow-[var(--shadow-inset-border),0_0_0_2px_var(--color-text)] [&::-webkit-search-cancel-button]:hidden"
        aria-label="Search your library"
      >
      <button
        v-if="query"
        type="button"
        class="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-text"
        aria-label="Clear search"
        @click="query = ''"
      >
        <X class="size-4" />
      </button>
    </label>

    <p
      v-if="uploadError"
      class="mb-6 whitespace-pre-wrap rounded-[6px] bg-surface p-3 text-sm text-negative"
      role="alert"
    >
      {{ uploadError }}
    </p>
    <p
      v-if="actionError"
      class="mb-6 rounded-[6px] bg-surface p-3 text-sm text-negative"
      role="alert"
    >
      {{ actionError }}
    </p>

    <section
      v-if="tracks.length"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5"
      aria-label="Tracks"
    >
      <TrackCard
        v-for="track in tracks"
        :key="track.id"
        :track="track"
        @delete="pendingDelete = track"
        @retry="onRetry(track)"
      />
    </section>

    <section
      v-else-if="!loading"
      class="flex flex-col items-center justify-center rounded-[8px] bg-surface px-6 py-16 text-center shadow-[var(--shadow-medium)]"
    >
      <div class="mb-5 flex size-20 items-center justify-center rounded-full bg-surface-mid">
        <Music2 class="size-9 text-text-muted" />
      </div>
      <template v-if="query">
        <h2 class="text-lg font-semibold">
          No matches for “{{ query }}”
        </h2>
        <p class="mt-2 max-w-sm text-sm text-text-muted">
          Try another title or artist.
        </p>
      </template>
      <template v-else>
        <h2 class="text-lg font-semibold">
          Nothing to sing yet
        </h2>
        <p class="mt-2 max-w-sm text-sm text-text-muted">
          Paste a YouTube link or import an {{ UPLOAD_EXTENSIONS_SENTENCE }} file to add your first Track.
        </p>
        <div class="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-pill border border-border-light px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:border-text"
            @click="openUrlForm"
          >
            <Link class="size-4" />
            From YouTube
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-pill bg-accent px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110"
            @click="pickFiles"
          >
            <Plus class="size-4" />
            Import file
          </button>
        </div>
      </template>
    </section>

    <ConfirmDialog
      :open="pendingDelete !== null"
      title="Delete this Track?"
      :message="pendingDelete ? `“${pendingDelete.title}” and every file under it will be removed. This cannot be undone.` : ''"
      confirm-label="Delete"
      :busy="deleting"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </main>
</template>
