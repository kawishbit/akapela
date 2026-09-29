<script setup lang="ts">
import { ArrowLeft, Loader2, Play } from 'lucide-vue-next'
import type { PlaylistPreview, PreviewSong } from '~~/server/lib/playlist-imports'
import type { ErrorText } from '~/utils/errors'

/**
 * The checklist a Playlist Import starts from, reached from the Library's
 * import field with a Spotify playlist or album link in `?url=`, so it
 * survives a reload. Every song whose Song is new here is ticked; one already
 * in the Library, or earlier in the same list, cannot be. Start creates the
 * Tracks and goes to the Jobs page, where the import is followed.
 */
const { t } = useI18n()
useHead(() => ({ title: t('app.pageTitle', { page: t('playlistImport.title') }) }))

const route = useRoute()
const url = computed(() => (typeof route.query.url === 'string' ? route.query.url : ''))

// In the browser only: reading Spotify takes a moment, and the page says so
// while it does rather than holding the whole page back.
const { data: preview, error: loadFailure, status } = useAsyncData(
  'playlist-import-preview',
  () => $fetch<PlaylistPreview>('/api/playlist-imports/preview', { method: 'POST', body: { url: url.value } }),
  { server: false, watch: [url] },
)

const loadError = computed<ErrorText | null>(() => (loadFailure.value ? describeError(loadFailure.value, t) : null))

const ticked = ref<string[]>([])
watch(preview, (value) => {
  ticked.value = value ? value.songs.filter(song => song.state === 'new').map(song => song.serviceId) : []
}, { immediate: true })

const tickable = computed(() => preview.value?.songs.filter(song => song.state === 'new') ?? [])
const tickedSongs = computed(() => tickable.value.filter(song => ticked.value.includes(song.serviceId)))
const allTicked = computed(() => tickable.value.length > 0 && tickedSongs.value.length === tickable.value.length)

function toggleAll() {
  ticked.value = allTicked.value ? [] : tickable.value.map(song => song.serviceId)
}

function toggle(song: PreviewSong) {
  if (song.state !== 'new') return
  ticked.value = ticked.value.includes(song.serviceId)
    ? ticked.value.filter(id => id !== song.serviceId)
    : [...ticked.value, song.serviceId]
}

const summary = computed(() => {
  const count = tickedSongs.value.length
  if (!preview.value || count === 0) return t('playlistImport.nothingTicked')
  const estimate = separationEstimateMs(preview.value.separationMsPerAudioMs, tickedSongs.value.map(song => song.durationMs))
  return t('playlistImport.summary', { count, time: formatEstimate(estimate, t) }, count)
})

const { refresh: refreshJobs } = useJobs()
const starting = ref(false)
const startError = ref<ErrorText | null>(null)

async function start() {
  if (tickedSongs.value.length === 0) return
  starting.value = true
  startError.value = null
  try {
    await $fetch('/api/playlist-imports', {
      method: 'POST',
      body: { url: url.value, serviceIds: tickedSongs.value.map(song => song.serviceId) },
    })
    await refreshJobs()
    await navigateTo('/jobs')
  }
  catch (error) {
    startError.value = describeError(error, t)
  }
  finally {
    starting.value = false
  }
}
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

    <div
      v-if="status === 'pending' || status === 'idle'"
      class="flex items-center gap-2 text-sm text-text-muted"
    >
      <Loader2 class="size-4 animate-spin" />
      {{ t('playlistImport.loading') }}
    </div>

    <section
      v-else-if="loadError"
      class="flex flex-col items-start gap-4 rounded-[8px] bg-surface p-5"
    >
      <h1 class="text-2xl font-bold tracking-tight">
        {{ t('playlistImport.title') }}
      </h1>
      <ErrorMessage :error="loadError" />
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110"
      >
        {{ t('playlistImport.back') }}
      </NuxtLink>
    </section>

    <template v-else-if="preview">
      <header class="mb-4">
        <p class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t(`playlistImport.kinds.${preview.kind}`) }} · {{ t('playlistImport.count', { count: preview.songs.length }, preview.songs.length) }}
        </p>
        <h1 class="mt-1 break-words text-2xl font-bold tracking-tight">
          {{ preview.name }}
        </h1>
        <p class="mt-2 text-sm text-text-muted">
          {{ t('playlistImport.intro') }}
        </p>
      </header>

      <div class="mb-4 rounded-[8px] bg-surface p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p
            class="min-w-0 flex-1 text-sm"
            aria-live="polite"
          >
            {{ summary }}
          </p>
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center gap-2 rounded-pill bg-accent px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110 disabled:opacity-60"
            :disabled="tickedSongs.length === 0 || starting"
            @click="start"
          >
            <Loader2
              v-if="starting"
              class="size-4 animate-spin"
            />
            <Play
              v-else
              class="size-4"
            />
            {{ t('playlistImport.start') }}
          </button>
        </div>
        <ErrorMessage
          class="mt-3"
          :error="startError"
        />
      </div>

      <div class="mb-3 flex justify-end">
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-pill px-4 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text disabled:opacity-60"
          :disabled="tickable.length === 0"
          @click="toggleAll"
        >
          {{ allTicked ? t('playlistImport.untickAll') : t('playlistImport.tickAll') }}
        </button>
      </div>

      <ul class="flex flex-col gap-1">
        <li
          v-for="(song, index) in preview.songs"
          :key="`${index}:${song.serviceId}`"
        >
          <label
            class="flex items-center gap-3 rounded-[6px] px-3 py-2"
            :class="song.state === 'new' ? 'cursor-pointer hover:bg-surface-mid' : 'opacity-50'"
          >
            <input
              type="checkbox"
              class="size-5 shrink-0 accent-[var(--color-accent)]"
              :checked="song.state === 'new' && ticked.includes(song.serviceId)"
              :disabled="song.state !== 'new'"
              :aria-label="t('playlistImport.songLabel', { title: song.title, artist: song.artist })"
              @change="toggle(song)"
            >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-bold">{{ song.title }}</span>
              <span class="block truncate text-xs text-text-muted">{{ song.artist }}</span>
            </span>
            <span class="shrink-0 text-right text-xs text-text-muted">
              <NuxtLink
                v-if="song.state === 'inLibrary' && song.trackId"
                :to="`/tracks/${song.trackId}`"
                class="block font-bold text-text underline-offset-2 hover:underline"
              >
                {{ t('playlistImport.inLibrary') }}
              </NuxtLink>
              <span
                v-else-if="song.state === 'duplicate'"
                class="block font-bold"
              >
                {{ t('playlistImport.duplicate') }}
              </span>
              <span class="block tabular-nums">{{ formatDuration(song.durationMs) }}</span>
            </span>
          </label>
        </li>
      </ul>

    </template>
  </main>
</template>
