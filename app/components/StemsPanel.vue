<script setup lang="ts">
import { AudioLines, CircleCheck, Loader2, Trash2, XCircle } from 'lucide-vue-next'
import { BACKING_SOURCES, type BackingSource } from '~~/shared/backing-source'
import type { TrackDetail } from '~~/server/lib/tracks'
import type { SeparationModelName } from '~~/server/lib/separators/models'
import type { ErrorText } from '~/utils/errors'

const props = defineProps<{ track: TrackDetail }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()

const player = usePlayer()

const state = computed(() => props.track.separationState)
const separating = computed(() => state.value === 'separating')

/**
 * Separation is minutes long. Its Job reports a real percentage now, a chunk
 * of the song at a time, and the elapsed time sits beside it so a slow machine
 * still visibly moves between chunks. Ticking starts after hydration so the
 * server and the client render the same markup.
 */
const now = ref<number | null>(null)
let ticker: ReturnType<typeof setInterval> | undefined
function stopTicking() {
  if (ticker) clearInterval(ticker)
  ticker = undefined
}
onMounted(() => {
  watch(separating, (running, wasRunning) => {
    // A Separation that ran may have downloaded its model, which the
    // Separation Model options say.
    if (wasRunning && !running) void refreshSettings()
    stopTicking()
    now.value = running ? Date.now() : null
    if (running) ticker = setInterval(() => (now.value = Date.now()), 1000)
  }, { immediate: true })
})
onBeforeUnmount(stopTicking)

const separatingLabel = computed(() => {
  const job = props.track.separationJob
  if (job?.state !== 'running') return t('stemsPanel.waiting')
  // The worker claimed it, so time it from when it did rather than from when
  // the singer asked, which may have been behind another job in the queue.
  const since = job.startedAt ?? job.createdAt
  // A model's first use downloads it, which the Job says in its own words.
  const activity = jobDetailText(job, t) ?? jobActivity('separate', t)
  return now.value === null
    ? t('stemsPanel.progress', { activity, progress: job.progress })
    : t('stemsPanel.progressElapsed', { activity, progress: job.progress, elapsed: formatDuration(now.value - since) })
})

const failure = computed(() => props.track.separationJob ? describeJobFailure(props.track.separationJob, t) : null)

/**
 * Switching Backing Source is the one Adjustment that is a reload rather than a
 * live parameter change, so say so while the player fetches and decodes the
 * other file instead of leaving a pressed button looking stuck.
 */
const loading = computed(() => player.isLoading(props.track.id))

const busy = ref(false)
const actionError = ref<ErrorText | null>(null)

/** Every action here is the same shape: one request, then let the page reload from it. */
async function ask(request: () => Promise<unknown>) {
  busy.value = true
  actionError.value = null
  try {
    await request()
    emit('changed')
  }
  catch (error) {
    actionError.value = describeError(error, t)
  }
  finally {
    busy.value = false
  }
}

function separate(path: 'separate' | 'separate/retry') {
  return ask(() => $fetch<unknown>(`/api/tracks/${props.track.id}/${path}`, { method: 'POST' }))
}

/**
 * Separate again is a choice of the other models, never the one that made
 * these Stems. The Stems stay playable until the new ones exist, so choosing
 * costs nothing but the wait.
 */
const { separationModels, refresh: refreshSettings } = useSettings()
const choosingModel = ref(false)
const otherModels = computed(() => otherSeparationModels(separationModels.value, props.track.stemsModel))

async function separateAgainWith(separationModel: SeparationModelName) {
  await ask(() => $fetch<unknown>(`/api/tracks/${props.track.id}/separate`, { method: 'POST', body: { separationModel } }))
  if (!actionError.value) choosingModel.value = false
}

function onSeparateClicked() {
  if (state.value === 'failed') return separate('separate/retry')
  if (state.value === 'ready' && props.track.hasStems) {
    choosingModel.value = !choosingModel.value
    return
  }
  return separate('separate')
}

const pendingDeleteStems = ref(false)

async function confirmDeleteStems() {
  await ask(() => $fetch<unknown>(`/api/tracks/${props.track.id}/stems`, { method: 'DELETE' }))
  pendingDeleteStems.value = false
}

/**
 * Remembers the switch on the Track and lets the page reload from it, which is
 * the same path a separation finishing takes: the player follows whatever the
 * Track says its Backing Source is.
 */
function useSource(backingSource: BackingSource) {
  if (busy.value || backingSource === props.track.backingSource) return
  return ask(() =>
    $fetch<unknown>(`/api/tracks/${props.track.id}/backing-source`, { method: 'PUT', body: { backingSource } }))
}
</script>

<template>
  <section class="rounded-[8px] bg-surface p-4 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
        {{ t('stemsPanel.heading') }}
      </h2>

      <!-- Which of this Track's audio files it sings over. Offered only once
           there are Stems: without them the original audio is the only thing
           there is to sing over, and a choice of one is noise. -->
      <div
        v-if="track.hasStems"
        class="flex items-center gap-1 rounded-pill bg-surface-mid p-1"
        role="group"
        :aria-label="t('stemsPanel.backingSource')"
      >
        <button
          v-for="source in BACKING_SOURCES"
          :key="source"
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
          :class="source === track.backingSource
            ? 'bg-text text-ground'
            : 'text-text-muted hover:text-text'"
          :aria-pressed="source === track.backingSource"
          :disabled="busy"
          @click="useSource(source)"
        >
          <Loader2
            v-if="source === track.backingSource && loading"
            class="size-3.5 animate-spin"
          />
          {{ t(`backingSources.${source}`) }}
        </button>
      </div>
    </div>

    <button
      v-if="track.hasStems"
      type="button"
      class="mt-3 inline-flex h-10 items-center gap-2 rounded-pill px-4 text-xs font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-negative disabled:opacity-60"
      :disabled="busy"
      @click="pendingDeleteStems = true"
    >
      <Trash2 class="size-3.5" />
      {{ t('stemsPanel.deleteStems', { size: formatMegabytes(track.stemsBytes) }) }}
    </button>

    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3">
      <p
        v-if="separating"
        class="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold"
        role="status"
      >
        <Loader2 class="size-4 shrink-0 animate-spin text-accent" />
        {{ separatingLabel }}
      </p>
      <p
        v-else-if="state === 'ready'"
        class="flex min-w-0 flex-1 items-center gap-2 text-sm text-text-muted"
      >
        <CircleCheck class="size-4 shrink-0 text-accent" />
        {{ t('stemsPanel.separatedWith', { model: track.stemsModel }) }}
      </p>
      <div
        v-else-if="state === 'failed'"
        class="flex min-w-0 flex-1 items-start gap-2"
      >
        <XCircle class="mt-0.5 size-4 shrink-0 text-negative" />
        <div class="min-w-0">
          <ErrorMessage :error="failure" />
          <!-- A failed Separation again leaves the Stems it meant to replace. -->
          <p
            v-if="track.hasStems"
            class="text-sm text-text-muted"
          >
            {{ t('stemsPanel.stillOnStems', { model: track.stemsModel }) }}
          </p>
        </div>
      </div>
      <p
        v-else
        class="min-w-0 flex-1 text-sm text-text-muted"
      >
        {{ t('stemsPanel.intro') }}
      </p>

      <button
        v-if="!separating"
        type="button"
        class="flex h-12 shrink-0 items-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
        :disabled="busy"
        :aria-expanded="state === 'ready' && track.hasStems ? choosingModel : undefined"
        @click="onSeparateClicked"
      >
        <Loader2
          v-if="busy"
          class="size-4 animate-spin"
        />
        <AudioLines
          v-else
          class="size-4"
        />
        {{ state === 'failed' ? t('stemsPanel.retry') : state === 'ready' ? t('stemsPanel.again') : t('stemsPanel.separate') }}
      </button>
    </div>

    <div
      v-if="choosingModel && !separating"
      class="mt-3 flex flex-col gap-1"
      role="group"
      :aria-label="t('stemsPanel.againWith')"
    >
      <p class="text-sm text-text-muted">
        {{ t('stemsPanel.againHint') }}
      </p>
      <button
        v-for="model in otherModels"
        :key="model.name"
        type="button"
        class="flex min-h-12 flex-col items-start rounded-[6px] bg-surface-mid px-4 py-2 text-left text-text transition hover:bg-card disabled:opacity-60"
        :disabled="busy"
        @click="separateAgainWith(model.name)"
      >
        <span class="flex w-full items-baseline justify-between gap-3">
          <span class="text-sm font-bold">{{ model.name }}</span>
          <span class="shrink-0 text-xs text-text-muted">{{ separationModelAvailability(model, t) }}</span>
        </span>
        <span class="text-sm text-text-muted">{{ separationModelDescription(model.name, t) }}</span>
      </button>
    </div>

    <p
      v-if="track.hasStems"
      class="mt-3 text-sm text-text-muted"
    >
      <template v-if="loading">
        {{ t('stemsPanel.switching') }}
      </template>
      <template v-else-if="track.backingSource === 'instrumental'">
        {{ t('stemsPanel.onInstrumental') }}
      </template>
      <template v-else>
        {{ t('stemsPanel.onOriginal') }}
      </template>
    </p>

    <ErrorMessage
      class="mt-3"
      :error="actionError"
    />

    <ConfirmDialog
      :open="pendingDeleteStems"
      :title="t('stemsPanel.deleteTitle')"
      :message="t('stemsPanel.deleteMessage', { size: formatMegabytes(track.stemsBytes) })"
      :confirm-label="t('stemsPanel.delete')"
      :busy="busy"
      @confirm="confirmDeleteStems"
      @cancel="pendingDeleteStems = false"
    />
  </section>
</template>
