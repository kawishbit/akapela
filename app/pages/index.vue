<script setup lang="ts">
import { Loader2, Music2, Plus, Search, X } from 'lucide-vue-next'
import type { TrackWithJob } from '~~/server/lib/tracks'
import { UPLOAD_ACCEPT, UPLOAD_EXTENSIONS_SENTENCE } from '~~/shared/upload'

const { query, tracks, loading, uploading, uploadError, upload, remove, retry } = useLibrary()

const fileInput = ref<HTMLInputElement | null>(null)
const pendingDelete = ref<TrackWithJob | null>(null)
const deleting = ref(false)
const actionError = ref<string | null>(null)

function pickFiles() {
  fileInput.value?.click()
}

async function onFilesChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length) await upload(files)
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
  <main class="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:pt-8">
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold tracking-tight">
        Your Library
      </h1>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-ground transition hover:brightness-110 disabled:opacity-60"
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
          Import an {{ UPLOAD_EXTENSIONS_SENTENCE }} file to add your first Track.
        </p>
        <button
          type="button"
          class="mt-6 inline-flex items-center gap-2 rounded-pill bg-accent px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-ground transition hover:brightness-110"
          @click="pickFiles"
        >
          <Plus class="size-4" />
          Import file
        </button>
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
