<script setup lang="ts">
import { ArrowLeft, Loader2, Mic2, Pause, Play, XCircle } from 'lucide-vue-next'

const route = useRoute()
const id = computed(() => String(route.params.id))
const player = usePlayer()
const playerState = player.state

const POLL_MS = 1000

const { track, error, notFound, refresh } = useTrackDetail(id)

// Keep the page current while the worker is still importing.
let timer: ReturnType<typeof setTimeout> | undefined
function stopPolling() {
  if (timer) clearTimeout(timer)
  timer = undefined
}
function schedulePoll() {
  stopPolling()
  if (track.value?.importState !== 'importing') return
  timer = setTimeout(async () => {
    await refresh()
    schedulePoll()
  }, POLL_MS)
}
watch(() => track.value?.importState, schedulePoll, { immediate: true })
onBeforeUnmount(stopPolling)

// Opening a ready Track makes it the player's current one, so play is a tap away.
// Loading starts after hydration so the server and client render the same button.
onMounted(() => {
  watch(track, (value) => {
    if (value?.importState === 'ready') player.open(value)
  }, { immediate: true })
})

const isCurrent = computed(() => playerState.value.track?.id === id.value)
const adjustments = computed(() => (isCurrent.value ? playerState.value.adjustments : track.value?.adjustments) ?? null)

const sourceLabel = computed(() => {
  if (!track.value) return ''
  return track.value.sourceKind === 'youtube' ? 'From YouTube' : `Uploaded from ${track.value.sourceRef}`
})

const failure = computed(() => errorSummary(track.value?.job?.error))

const retrying = ref(false)
const actionError = ref<string | null>(null)
async function retry() {
  if (!track.value) return
  retrying.value = true
  actionError.value = null
  try {
    await $fetch(`/api/tracks/${track.value.id}/retry`, { method: 'POST' })
    await refresh()
  }
  catch (e) {
    actionError.value = describeError(e)
  }
  finally {
    retrying.value = false
  }
}

useHead(() => ({ title: track.value ? `${track.value.title} · Presto` : 'Presto' }))
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 pb-36 pt-4 sm:pb-28 sm:pt-6">
    <NuxtLink
      to="/"
      class="mb-4 inline-flex h-11 items-center gap-2 rounded-pill pr-4 text-sm font-bold text-text-muted transition hover:text-text"
    >
      <ArrowLeft class="size-4" />
      Library
    </NuxtLink>

    <section
      v-if="notFound"
      class="flex flex-col items-center rounded-[8px] bg-surface px-6 py-16 text-center shadow-[var(--shadow-medium)]"
    >
      <h1 class="text-lg font-semibold">
        Track not found
      </h1>
      <p class="mt-2 text-sm text-text-muted">
        It may have been deleted.
      </p>
    </section>

    <template v-else-if="track">
      <header class="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end">
        <div class="relative mx-auto w-full max-w-64 shrink-0 sm:mx-0 sm:w-56">
          <img
            :src="`/api/tracks/${track.id}/cover?v=${track.updatedAt}`"
            :alt="`Cover art for ${track.title}`"
            class="aspect-square w-full rounded-[6px] bg-surface-mid object-cover shadow-[var(--shadow-heavy)]"
            :class="{ 'opacity-40': track.importState !== 'ready' }"
            width="512"
            height="512"
          >
          <div
            v-if="track.importState === 'importing'"
            class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"
          >
            <Loader2 class="size-8 animate-spin text-accent" />
            <p class="text-xs font-bold">
              {{ track.job?.state === 'running' ? `Importing ${track.job.progress}%` : 'Waiting for worker' }}
            </p>
          </div>
          <div
            v-else-if="track.importState === 'failed'"
            class="absolute inset-0 flex items-center justify-center"
          >
            <XCircle class="size-12 text-negative" />
          </div>
        </div>

        <div class="min-w-0 flex-1 text-center sm:text-left">
          <p class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
            Track
          </p>
          <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {{ track.title }}
          </h1>
          <p class="mt-1 text-sm text-text-muted">
            <span>{{ track.artist ?? 'Unknown artist' }}</span>
            <span v-if="track.importState === 'ready'"> · {{ formatDuration(track.durationMs) }}</span>
          </p>
          <p class="mt-1 truncate text-xs text-text-muted">
            {{ sourceLabel }}
          </p>

          <div class="mt-5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            <button
              v-if="track.importState === 'ready'"
              type="button"
              class="inline-flex h-14 items-center gap-3 rounded-pill bg-accent pl-5 pr-7 text-sm font-bold uppercase tracking-[1.4px] text-ground transition hover:brightness-110 disabled:opacity-60"
              :disabled="isCurrent && (playerState.loading || playerState.error !== null)"
              @click="isCurrent ? player.toggle() : player.open(track).then(() => player.play())"
            >
              <Loader2
                v-if="isCurrent && playerState.loading"
                class="size-5 animate-spin"
              />
              <Pause
                v-else-if="isCurrent && playerState.playing"
                class="size-5"
                fill="currentColor"
              />
              <Play
                v-else
                class="size-5"
                fill="currentColor"
              />
              {{ isCurrent && playerState.playing ? 'Pause' : 'Play' }}
            </button>
            <NuxtLink
              v-if="track.importState === 'ready'"
              :to="`/tracks/${track.id}/sing`"
              class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
            >
              <Mic2 class="size-4" />
              Sing
            </NuxtLink>
            <button
              v-if="track.importState === 'failed'"
              type="button"
              class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
              :disabled="retrying"
              @click="retry"
            >
              <Loader2
                v-if="retrying"
                class="size-4 animate-spin"
              />
              Retry import
            </button>
          </div>

          <p
            v-if="track.importState === 'failed'"
            class="mt-3 text-sm text-negative"
            :title="track.job?.error ?? undefined"
          >
            {{ failure }}
          </p>
          <p
            v-if="isCurrent && playerState.error"
            class="mt-3 text-sm text-negative"
            role="alert"
          >
            {{ playerState.error }}
          </p>
          <p
            v-if="actionError"
            class="mt-3 text-sm text-negative"
            role="alert"
          >
            {{ actionError }}
          </p>
        </div>
      </header>

      <SongPanel
        v-if="track.importState === 'ready'"
        class="mb-4"
        :track="track"
        @confirmed="track = $event"
      />

      <LyricsPanel
        v-if="track.importState === 'ready'"
        class="mb-4"
        :track="track"
        @changed="track = $event"
      />

      <AdjustmentsPanel
        v-if="track.importState === 'ready' && adjustments"
        :adjustments="adjustments"
        @change="player.setAdjustments($event)"
        @reset="player.resetAdjustments()"
      />
      <p
        v-if="isCurrent && playerState.saveError"
        class="mt-3 text-sm text-negative"
        role="alert"
      >
        Adjustments could not be saved: {{ playerState.saveError }}
      </p>
    </template>

    <p
      v-else-if="error"
      class="rounded-[6px] bg-surface p-3 text-sm text-negative"
      role="alert"
    >
      {{ describeError(error) }}
    </p>
  </main>
</template>
