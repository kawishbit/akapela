<script setup lang="ts">
import { AudioLines, ListPlus, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-vue-next'
import type { TrackWithJob } from '~~/server/lib/tracks'

const props = defineProps<{ track: TrackWithJob }>()
const emit = defineEmits<{ delete: [], retry: [] }>()

const { t } = useI18n()

const progress = computed(() => {
  const job = props.track.job
  if (!job) return 0
  return job.state === 'running' ? job.progress : 0
})

const importLabel = computed(() => {
  const job = props.track.job
  if (!job || job.state === 'queued') return t('trackCard.waiting')
  return t('trackCard.importing', { progress: job.progress })
})

const failure = computed(() => props.track.job ? describeJobFailure(props.track.job, t) : null)

// A separating Track can be queued; its entry says how far along it is. One
// still importing cannot be sung at all.
const { ask: askToQueue } = useAddToQueue()

/** A Job's own row on the Jobs page, which highlights it on arrival. */
function jobLink(jobId: string | null | undefined): string {
  return jobId ? `/jobs#${jobId}` : '/jobs'
}
</script>

<template>
  <article
    class="group relative flex flex-col gap-3 rounded-[8px] bg-surface p-3 transition hover:bg-surface-mid"
    :aria-busy="track.importState === 'importing'"
  >
    <NuxtLink
      :to="`/tracks/${track.id}`"
      class="absolute inset-0 rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-text"
      :aria-label="t('trackCard.open', { title: track.title })"
    />

    <div class="pointer-events-none relative aspect-square overflow-hidden rounded-[6px] bg-surface-mid shadow-[var(--shadow-medium)]">
      <img
        :src="`/api/tracks/${track.id}/cover?v=${track.updatedAt}`"
        :alt="t('trackCard.cover', { title: track.title })"
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
        <!-- The chip is its own way in: to this import's row on the Jobs page.
             Everywhere else on the card still opens the Track. -->
        <NuxtLink
          :to="jobLink(track.job?.id)"
          class="pointer-events-auto flex w-full max-w-32 flex-col items-center gap-3 rounded-[6px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-text"
          :aria-label="t('trackCard.importOnJobs', { status: importLabel })"
        >
          <span class="text-xs font-bold text-text">
            {{ importLabel }}
          </span>
          <span
            class="block h-1 w-full overflow-hidden rounded-pill bg-black/50"
            role="progressbar"
            :aria-valuenow="progress"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span
              class="block h-full rounded-pill bg-accent transition-[width] duration-500"
              :style="{ width: `${progress}%` }"
            />
          </span>
        </NuxtLink>
      </div>

      <NuxtLink
        v-else-if="track.separationState === 'separating'"
        :to="jobLink(track.separationJobId)"
        class="pointer-events-auto absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-pill bg-black/70 px-3 py-1.5 text-xs font-bold text-white outline-none hover:bg-black/85 focus-visible:ring-2 focus-visible:ring-text"
        :aria-label="t('trackCard.separatingOnJobs', { title: track.title })"
      >
        <AudioLines class="size-3.5 text-accent" />
        {{ t('trackCard.separating') }}
      </NuxtLink>

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
        <span>{{ track.artist ?? t('common.unknownArtist') }}</span>
        <span v-if="track.importState === 'ready'"> · {{ formatDuration(track.durationMs) }}</span>
      </p>
      <div
        v-if="track.importState === 'failed'"
        class="mt-2 flex flex-col gap-2"
      >
        <p
          class="line-clamp-3 text-xs text-negative"
          :title="failure?.details ?? undefined"
        >
          {{ failure?.message }}
        </p>
        <button
          type="button"
          class="relative inline-flex items-center justify-center gap-2 self-start rounded-pill bg-surface-mid px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card group-hover:bg-card"
          @click="emit('retry')"
        >
          <RotateCcw class="size-3.5" />
          {{ t('common.retry') }}
        </button>
      </div>
    </div>

    <button
      v-if="track.importState === 'ready'"
      type="button"
      class="absolute right-16 top-4 flex size-10 items-center justify-center rounded-full bg-black/60 text-white shadow-[var(--shadow-medium)] transition hover:bg-black/80 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      :aria-label="t('trackCard.addToQueue', { title: track.title })"
      :title="t('trackCard.addToQueueShort')"
      @click="askToQueue(track)"
    >
      <ListPlus class="size-4" />
    </button>

    <button
      type="button"
      class="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-black/60 text-text-muted shadow-[var(--shadow-medium)] transition hover:text-negative focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      :aria-label="t('trackCard.delete', { title: track.title })"
      @click="emit('delete')"
    >
      <Trash2 class="size-4" />
    </button>
  </article>
</template>
