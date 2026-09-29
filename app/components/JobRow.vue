<script setup lang="ts">
import { Ban, CircleCheck, Link, Loader2, RotateCcw, X, XCircle } from 'lucide-vue-next'
import type { JobListEntry } from '~~/server/lib/job-actions'
import { DEFAULT_SEPARATION_MODEL } from '~~/server/lib/separators/models'

/**
 * One Job on the Jobs page. Keyed by the Job's id, with its actions on the
 * row itself, so a later "cancel all queued Separations" drops in beside them
 * rather than forcing a selection model on the page.
 */
const props = defineProps<{ job: JobListEntry, busy: boolean, highlighted?: boolean }>()
const emit = defineEmits<{ cancel: [], retry: [] }>()

const { t, locale } = useI18n()

// A Job with no target never had a Track; one whose Track has gone did.
const title = computed(() => props.job.track?.title
  ?? (props.job.targetId ? t('jobs.removedTrack') : t('jobs.backgroundJob')))

const activity = computed(() => jobActivity(props.job.type, t))
const detail = computed(() => jobDetailText(props.job, t))

/** A failed Job's reason, with the raw text it failed with under Details. */
const failure = computed(() => props.job.state === 'failed' ? describeJobFailure(props.job, t) : null)

const stateLabel = computed(() => {
  switch (props.job.state) {
    case 'queued': return queuedBehind(props.job.lane, t)
    case 'running': return detail.value
      ? t('jobs.progressDetail', { detail: detail.value, progress: props.job.progress })
      : t('jobs.progress', { progress: props.job.progress })
    case 'succeeded': return detail.value ?? t('jobs.done')
    case 'cancelled': return t('jobs.cancelled')
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
      :aria-label="t('jobs.open', { title })"
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
        {{ activity }}
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
        {{ takeLabel(job.take, t, locale) }}
      </p>
      <!-- Fixed when the Separation was asked for, so a row queued before the
           default changed still says what it will actually run. -->
      <p
        v-if="job.type === 'separate'"
        class="truncate text-sm text-text-muted"
      >
        {{ job.separationModel ?? DEFAULT_SEPARATION_MODEL }}
      </p>

      <div
        v-if="job.state === 'running'"
        class="mt-2 h-1 w-full max-w-48 overflow-hidden rounded-pill bg-surface-mid"
        role="progressbar"
        :aria-valuenow="job.progress"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="t('jobs.progressLabel', { activity, title })"
      >
        <div
          class="h-full rounded-pill bg-accent transition-[width] duration-500"
          :style="{ width: `${job.progress}%` }"
        />
      </div>

      <div
        v-if="failure"
        class="mt-1 flex min-w-0 items-start gap-1.5"
      >
        <XCircle class="mt-0.5 size-3.5 shrink-0 text-negative" />
        <ErrorMessage
          class="min-w-0"
          :error="failure"
        />
      </div>
      <p
        v-else
        class="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-text-muted"
      >
        <Loader2
          v-if="job.state === 'running'"
          class="size-3.5 shrink-0 animate-spin text-accent"
        />
        <CircleCheck
          v-else-if="job.state === 'succeeded'"
          class="size-3.5 shrink-0 text-accent"
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
      :aria-label="t('jobs.cancelLabel', { activity, title })"
      @click="emit('cancel')"
    >
      <X class="size-3.5" />
      <span class="hidden sm:inline">{{ t('jobs.cancel') }}</span>
    </button>
    <!-- Found nothing on YouTube: searching again would too, so its Track's page asks for a link. -->
    <NuxtLink
      v-else-if="job.state === 'failed' && job.errorCode === 'noYoutubeMatch' && job.track"
      :to="`/tracks/${job.track.id}`"
      class="inline-flex shrink-0 items-center gap-2 rounded-pill bg-surface-mid px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
      :aria-label="t('jobs.pasteLinkLabel', { title })"
    >
      <Link class="size-3.5" />
      <span class="hidden sm:inline">{{ t('jobs.pasteLink') }}</span>
    </NuxtLink>
    <button
      v-else-if="job.state === 'failed'"
      type="button"
      class="inline-flex shrink-0 items-center gap-2 rounded-pill bg-surface-mid px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
      :disabled="busy"
      :aria-label="t('jobs.retryLabel', { activity, title })"
      @click="emit('retry')"
    >
      <RotateCcw class="size-3.5" />
      <span class="hidden sm:inline">{{ t('common.retry') }}</span>
    </button>
  </li>
</template>
