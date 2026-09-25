<script setup lang="ts">
import { Ban, CircleCheck, Loader2, RotateCcw, X, XCircle } from 'lucide-vue-next'
import type { JobListEntry } from '~~/server/lib/job-actions'

/**
 * One Job on the Jobs page. Keyed by the Job's id, with its actions on the
 * row itself, so a later "cancel all queued Separations" drops in beside them
 * rather than forcing a selection model on the page.
 */
const props = defineProps<{ job: JobListEntry, busy: boolean, highlighted?: boolean }>()
const emit = defineEmits<{ cancel: [], retry: [] }>()

// A Job with no target never had a Track; one whose Track has gone did.
const title = computed(() => props.job.track?.title ?? (props.job.targetId ? 'Removed Track' : 'Background Job'))

const stateLabel = computed(() => {
  switch (props.job.state) {
    case 'queued': return queuedBehind(props.job.lane)
    case 'running': return `${props.job.progress}%`
    case 'succeeded': return 'Done'
    case 'failed': return errorSummary(props.job.error, `${jobActivity(props.job.type)} failed`)
    case 'cancelled': return 'Cancelled'
    default: return props.job.state
  }
})

const active = computed(() => isActiveJob(props.job))
</script>

<template>
  <li
    :id="job.id"
    class="flex scroll-mt-24 items-center gap-3 rounded-[8px] bg-surface p-3 transition-shadow"
    :class="{ 'shadow-[0_0_0_2px_var(--color-accent)]': highlighted }"
  >
    <NuxtLink
      v-if="job.track"
      :to="`/tracks/${job.track.id}`"
      class="shrink-0 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-text"
      :aria-label="`Open ${title}`"
    >
      <img
        :src="`/api/tracks/${job.track.id}/cover?v=${job.track.updatedAt}`"
        alt=""
        class="size-14 rounded-[6px] bg-surface-mid object-cover"
        loading="lazy"
        width="56"
        height="56"
      >
    </NuxtLink>
    <div
      v-else
      class="size-14 shrink-0 rounded-[6px] bg-surface-mid"
    />

    <div class="min-w-0 flex-1">
      <p class="truncate text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
        {{ jobActivity(job.type) }}
      </p>
      <p
        class="truncate text-base font-bold"
        :title="title"
      >
        {{ title }}
      </p>
      <p
        v-if="job.take"
        class="truncate text-sm text-text-muted"
      >
        {{ takeLabel(job.take) }}
      </p>

      <div
        v-if="job.state === 'running'"
        class="mt-2 h-1 w-full max-w-48 overflow-hidden rounded-pill bg-surface-mid"
        role="progressbar"
        :aria-valuenow="job.progress"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`${jobActivity(job.type)} ${title}`"
      >
        <div
          class="h-full rounded-pill bg-accent transition-[width] duration-500"
          :style="{ width: `${job.progress}%` }"
        />
      </div>

      <p
        class="mt-1 flex min-w-0 items-center gap-1.5 text-sm"
        :class="job.state === 'failed' ? 'text-negative' : 'text-text-muted'"
        :title="job.state === 'failed' ? (job.error ?? undefined) : undefined"
      >
        <Loader2
          v-if="job.state === 'running'"
          class="size-3.5 shrink-0 animate-spin text-accent"
        />
        <CircleCheck
          v-else-if="job.state === 'succeeded'"
          class="size-3.5 shrink-0 text-accent"
        />
        <XCircle
          v-else-if="job.state === 'failed'"
          class="size-3.5 shrink-0"
        />
        <Ban
          v-else-if="job.state === 'cancelled'"
          class="size-3.5 shrink-0"
        />
        <span class="line-clamp-2">{{ stateLabel }}</span>
      </p>
    </div>

    <button
      v-if="active"
      type="button"
      class="inline-flex shrink-0 items-center gap-2 rounded-pill border border-border-light px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:border-text disabled:opacity-60"
      :disabled="busy"
      :aria-label="`Cancel ${jobActivity(job.type).toLowerCase()} ${title}`"
      @click="emit('cancel')"
    >
      <X class="size-3.5" />
      <span class="hidden sm:inline">Cancel</span>
    </button>
    <button
      v-else-if="job.state === 'failed'"
      type="button"
      class="inline-flex shrink-0 items-center gap-2 rounded-pill bg-surface-mid px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
      :disabled="busy"
      :aria-label="`Retry ${jobActivity(job.type).toLowerCase()} ${title}`"
      @click="emit('retry')"
    >
      <RotateCcw class="size-3.5" />
      <span class="hidden sm:inline">Retry</span>
    </button>
  </li>
</template>
