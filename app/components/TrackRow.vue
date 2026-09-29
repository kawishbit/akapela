<script setup lang="ts">
import { AudioLines, ListPlus, RotateCcw, Trash2, XCircle } from 'lucide-vue-next'
import type { TrackWithJob } from '~~/server/lib/tracks'

/** A Track as one row of the Library's list view: `TrackCard`, laid out to scan rather than to browse. */
const props = defineProps<{ track: TrackWithJob }>()
const emit = defineEmits<{ delete: [], retry: [], retried: [] }>()

const { t } = useI18n()
const { progress, importLabel, failure, needsLink } = useTrackStatus(() => props.track)

// A separating Track can be queued; its entry says how far along it is. One
// still importing cannot be sung at all.
const { ask: askToQueue } = useAddToQueue()
</script>

<template>
  <li
    class="group relative flex items-center gap-3 rounded-[8px] px-2 py-2 transition hover:bg-surface-mid sm:gap-4 sm:px-3"
    :aria-busy="track.importState === 'importing'"
  >
    <NuxtLink
      :to="`/tracks/${track.id}`"
      class="absolute inset-0 rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-text"
      :aria-label="t('trackCard.open', { title: track.title })"
    />

    <div class="pointer-events-none relative size-12 shrink-0 overflow-hidden rounded-[4px] bg-surface-mid shadow-[var(--shadow-medium)]">
      <img
        :src="`/api/tracks/${track.id}/cover?v=${track.updatedAt}`"
        :alt="t('trackCard.cover', { title: track.title })"
        class="size-full object-cover"
        :class="{ 'opacity-40': track.importState !== 'ready' }"
        loading="lazy"
        width="96"
        height="96"
      >
      <div
        v-if="track.importState === 'failed'"
        class="absolute inset-0 flex items-center justify-center"
      >
        <XCircle class="size-6 text-negative" />
      </div>
    </div>

    <div class="min-w-0 flex-1">
      <h3
        class="truncate text-base font-bold"
        :title="track.title"
      >
        {{ track.title }}
      </h3>
      <p class="truncate text-sm text-text-muted">
        {{ track.artist ?? t('common.unknownArtist') }}
      </p>

      <!-- The chip is its own way in: to this import's row on the Jobs page.
           Everywhere else on the row still opens the Track. -->
      <NuxtLink
        v-if="track.importState === 'importing'"
        :to="jobLink(track.job?.id)"
        class="relative mt-1.5 flex max-w-56 items-center gap-2 rounded-[4px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-text"
        :aria-label="t('trackCard.importOnJobs', { status: importLabel })"
      >
        <span class="shrink-0 text-xs font-bold text-text">
          {{ importLabel }}
        </span>
        <span
          class="block h-1 w-full overflow-hidden rounded-pill bg-surface-mid"
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

      <div
        v-else-if="track.importState === 'failed'"
        class="mt-1.5 flex flex-col gap-2"
      >
        <p
          class="line-clamp-2 text-xs text-negative"
          :title="failure?.details ?? undefined"
        >
          {{ failure?.message }}
        </p>
        <YoutubeLinkRetry
          v-if="needsLink"
          :track-id="track.id"
          :title="track.title"
          compact
          @retried="emit('retried')"
        />
        <button
          v-else
          type="button"
          class="relative inline-flex items-center justify-center gap-2 self-start rounded-pill bg-surface-mid px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card group-hover:bg-card"
          @click="emit('retry')"
        >
          <RotateCcw class="size-3.5" />
          {{ t('common.retry') }}
        </button>
      </div>
    </div>

    <NuxtLink
      v-if="track.importState === 'ready' && track.separationState === 'separating'"
      :to="jobLink(track.separationJobId)"
      class="relative hidden shrink-0 items-center gap-1.5 rounded-pill bg-surface-mid px-3 py-1.5 text-xs font-bold text-text outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-text sm:inline-flex"
      :aria-label="t('trackCard.separatingOnJobs', { title: track.title })"
    >
      <AudioLines class="size-3.5 text-accent" />
      {{ t('trackCard.separating') }}
    </NuxtLink>

    <span
      v-if="track.importState === 'ready'"
      class="pointer-events-none w-12 shrink-0 text-right text-sm tabular-nums text-text-muted"
    >
      {{ formatDuration(track.durationMs) }}
    </span>

    <div class="relative flex shrink-0 items-center gap-1">
      <button
        v-if="track.importState === 'ready'"
        type="button"
        class="flex size-10 items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-text"
        :aria-label="t('trackCard.addToQueue', { title: track.title })"
        :title="t('trackCard.addToQueueShort')"
        @click="askToQueue(track)"
      >
        <ListPlus class="size-4" />
      </button>
      <button
        type="button"
        class="flex size-10 items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-negative"
        :aria-label="t('trackCard.delete', { title: track.title })"
        @click="emit('delete')"
      >
        <Trash2 class="size-4" />
      </button>
    </div>
  </li>
</template>
