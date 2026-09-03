<script setup lang="ts">
import { Loader2, RotateCcw, Trash2, XCircle } from 'lucide-vue-next'
import type { TrackWithJob } from '~~/server/lib/tracks'

const props = defineProps<{ track: TrackWithJob }>()
const emit = defineEmits<{ delete: [], retry: [] }>()

const progress = computed(() => {
  const job = props.track.job
  if (!job) return 0
  return job.state === 'running' ? job.progress : 0
})

const importLabel = computed(() => {
  const job = props.track.job
  if (!job || job.state === 'queued') return 'Waiting for worker'
  return `Importing ${job.progress}%`
})

const failure = computed(() => errorSummary(props.track.job?.error))
</script>

<template>
  <article
    class="group relative flex flex-col gap-3 rounded-[8px] bg-surface p-3 transition hover:bg-surface-mid"
    :aria-busy="track.importState === 'importing'"
  >
    <NuxtLink
      :to="`/tracks/${track.id}`"
      class="absolute inset-0 rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-text"
      :aria-label="`Open ${track.title}`"
    />

    <div class="pointer-events-none relative aspect-square overflow-hidden rounded-[6px] bg-surface-mid shadow-[var(--shadow-medium)]">
      <img
        :src="`/api/tracks/${track.id}/cover?v=${track.updatedAt}`"
        :alt="`Cover art for ${track.title}`"
        class="size-full object-cover"
        :class="{ 'opacity-40': track.importState !== 'ready' }"
        loading="lazy"
        width="512"
        height="512"
      >

      <div
        v-if="track.importState === 'importing'"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
      >
        <Loader2 class="size-7 animate-spin text-accent" />
        <p class="text-xs font-bold text-text">
          {{ importLabel }}
        </p>
        <div
          class="h-1 w-full max-w-32 overflow-hidden rounded-pill bg-black/50"
          role="progressbar"
          :aria-valuenow="progress"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="h-full rounded-pill bg-accent transition-[width] duration-500"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>

      <div
        v-else-if="track.importState === 'failed'"
        class="absolute inset-0 flex items-center justify-center"
      >
        <XCircle class="size-10 text-negative" />
      </div>
    </div>

    <div class="min-w-0">
      <h3
        class="truncate text-base font-bold"
        :title="track.title"
      >
        {{ track.title }}
      </h3>
      <p class="truncate text-sm text-text-muted">
        <span>{{ track.artist ?? 'Unknown artist' }}</span>
        <span v-if="track.importState === 'ready'"> · {{ formatDuration(track.durationMs) }}</span>
      </p>
      <div
        v-if="track.importState === 'failed'"
        class="mt-2 flex flex-col gap-2"
      >
        <p
          class="line-clamp-3 text-xs text-negative"
          :title="track.job?.error ?? undefined"
        >
          {{ failure }}
        </p>
        <button
          type="button"
          class="relative inline-flex items-center justify-center gap-2 self-start rounded-pill bg-surface-mid px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card group-hover:bg-card"
          @click="emit('retry')"
        >
          <RotateCcw class="size-3.5" />
          Retry
        </button>
      </div>
    </div>

    <button
      type="button"
      class="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-black/60 text-text-muted shadow-[var(--shadow-medium)] transition hover:text-negative focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      :aria-label="`Delete ${track.title}`"
      @click="emit('delete')"
    >
      <Trash2 class="size-4" />
    </button>
  </article>
</template>
