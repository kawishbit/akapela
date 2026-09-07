<script setup lang="ts">
import { AudioLines, CircleCheck, Loader2, XCircle } from 'lucide-vue-next'
import type { TrackDetail } from '~~/server/lib/tracks'

const props = defineProps<{ track: TrackDetail }>()
const emit = defineEmits<{ changed: [] }>()

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

const busy = ref(false)
const actionError = ref<string | null>(null)
async function separate(path: 'separate' | 'separate/retry') {
  busy.value = true
  actionError.value = null
  try {
    await $fetch(`/api/tracks/${props.track.id}/${path}`, { method: 'POST' })
    emit('changed')
  }
  catch (error) {
    actionError.value = describeError(error)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="rounded-[8px] bg-surface p-4 sm:p-5">
    <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
      Stems
    </h2>

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
      v-if="actionError"
      class="mt-3 text-sm text-negative"
      role="alert"
    >
      {{ actionError }}
    </p>
  </section>
</template>
