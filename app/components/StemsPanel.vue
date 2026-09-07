<script setup lang="ts">
import { AudioLines, CircleCheck, Loader2, Trash2, XCircle } from 'lucide-vue-next'
import { BACKING_SOURCES, BACKING_SOURCE_LABELS, type BackingSource } from '~~/shared/backing-source'
import type { TrackDetail } from '~~/server/lib/tracks'

const props = defineProps<{ track: TrackDetail }>()
const emit = defineEmits<{ changed: [] }>()

const player = usePlayer()

const state = computed(() => props.track.separationState)
const separating = computed(() => state.value === 'separating')

/**
 * Separation is minutes long and the model reports nothing usable in between,
 * so this counts up rather than filling a bar (spec, phase two): a bar sitting
 * at 10 percent for four minutes reads as broken, and the remaining time
 * genuinely is not knowable. Ticking starts after hydration so the server and
 * the client render the same markup.
 */
const now = ref<number | null>(null)
let ticker: ReturnType<typeof setInterval> | undefined
function stopTicking() {
  if (ticker) clearInterval(ticker)
  ticker = undefined
}
onMounted(() => {
  watch(separating, (running) => {
    stopTicking()
    now.value = running ? Date.now() : null
    if (running) ticker = setInterval(() => (now.value = Date.now()), 1000)
  }, { immediate: true })
})
onBeforeUnmount(stopTicking)

const separatingLabel = computed(() => {
  const job = props.track.separationJob
  if (job?.state !== 'running') return 'Waiting for worker'
  // The worker claimed it, so time it from when it did rather than from when
  // the singer asked, which may have been behind another job in the queue.
  const since = job.startedAt ?? job.createdAt
  return now.value === null ? 'Separating…' : `Separating… ${formatDuration(now.value - since)}`
})

const failure = computed(() => errorSummary(props.track.separationJob?.error, 'Separation failed'))

/**
 * Switching Backing Source is the one Adjustment that is a reload rather than a
 * live parameter change, so say so while the player fetches and decodes the
 * other file instead of leaving a pressed button looking stuck.
 */
const loading = computed(() => player.isLoading(props.track.id))

const busy = ref(false)
const actionError = ref<string | null>(null)

/** Every action here is the same shape: one request, then let the page reload from it. */
async function ask(request: () => Promise<unknown>) {
  busy.value = true
  actionError.value = null
  try {
    await request()
    emit('changed')
  }
  catch (error) {
    actionError.value = describeError(error)
  }
  finally {
    busy.value = false
  }
}

function separate(path: 'separate' | 'separate/retry') {
  return ask(() => $fetch<unknown>(`/api/tracks/${props.track.id}/${path}`, { method: 'POST' }))
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
        Stems
      </h2>

      <!-- Which of this Track's audio files it sings over. Offered only once
           there are Stems: without them the original audio is the only thing
           there is to sing over, and a choice of one is noise. -->
      <div
        v-if="track.hasStems"
        class="flex items-center gap-1 rounded-pill bg-surface-mid p-1"
        role="group"
        aria-label="Backing Source"
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
          {{ BACKING_SOURCE_LABELS[source] }}
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
      Delete Stems ({{ formatMegabytes(track.stemsBytes) }})
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
        This Track has an Instrumental Stem and a Vocals Stem.
      </p>
      <p
        v-else-if="state === 'failed'"
        class="flex min-w-0 flex-1 items-center gap-2 text-sm text-negative"
        role="alert"
        :title="track.separationJob?.error ?? undefined"
      >
        <XCircle class="size-4 shrink-0" />
        {{ failure }}
      </p>
      <p
        v-else
        class="min-w-0 flex-1 text-sm text-text-muted"
      >
        Vocal removal splits this Track into an Instrumental Stem to sing over and a Vocals Stem.
        It runs on the server and takes a few minutes.
      </p>

      <button
        v-if="!separating"
        type="button"
        class="flex h-12 shrink-0 items-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
        :disabled="busy"
        @click="separate(state === 'failed' ? 'separate/retry' : 'separate')"
      >
        <Loader2
          v-if="busy"
          class="size-4 animate-spin"
        />
        <AudioLines
          v-else
          class="size-4"
        />
        {{ state === 'failed' ? 'Retry separation' : state === 'ready' ? 'Separate again' : 'Separate' }}
      </button>
    </div>

    <p
      v-if="track.hasStems"
      class="mt-3 text-sm text-text-muted"
    >
      <template v-if="loading">
        Switching the Backing Track over. It picks up where it was.
      </template>
      <template v-else-if="track.backingSource === 'instrumental'">
        Singing over the Instrumental Stem. Separation is lossy, so the audio this Track arrived
        with is kept untouched and is one tap away.
      </template>
      <template v-else>
        Singing over the audio this Track arrived with, not its Instrumental Stem.
      </template>
    </p>

    <p
      v-if="actionError"
      class="mt-3 text-sm text-negative"
      role="alert"
    >
      {{ actionError }}
    </p>

    <ConfirmDialog
      :open="pendingDeleteStems"
      title="Delete these Stems?"
      :message="`The Instrumental and Vocals Stem will be removed, reclaiming ${formatMegabytes(track.stemsBytes)}. The Track and everything sung on it are untouched, and separating again will make Stems anew.`"
      confirm-label="Delete"
      :busy="busy"
      @confirm="confirmDeleteStems"
      @cancel="pendingDeleteStems = false"
    />
  </section>
</template>
