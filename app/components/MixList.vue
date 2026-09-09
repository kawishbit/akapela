<script setup lang="ts">
import { Download, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-vue-next'
import type { Take } from '~~/server/db/schema'
import type { MixWithJob } from '~~/server/lib/mixes'

const props = defineProps<{ trackId: string, take: Take, mixes: MixWithJob[] }>()
const emit = defineEmits<{ changed: [] }>()

const busyId = ref<string | null>(null)
const pendingDeleteId = ref<string | null>(null)
const actionError = ref<string | null>(null)

function audioUrl(mix: MixWithJob, format?: 'wav') {
  const base = `/api/tracks/${props.trackId}/takes/${props.take.id}/mixes/${mix.id}/audio`
  return format ? `${base}?format=${format}` : base
}

function status(mix: MixWithJob): { label: string, progress: number | null, failed: boolean } {
  const job = mix.job
  if (mix.mp3Path) return { label: 'Ready', progress: null, failed: false }
  if (!job || job.state === 'queued') return { label: 'Waiting for worker', progress: 0, failed: false }
  if (job.state === 'running') return { label: `Rendering ${job.progress}%`, progress: job.progress, failed: false }
  if (job.state === 'failed') return { label: errorSummary(job.error), progress: null, failed: true }
  return { label: 'Rendering', progress: null, failed: false }
}

async function retry(mix: MixWithJob) {
  busyId.value = mix.id
  actionError.value = null
  try {
    await $fetch(`/api/tracks/${props.trackId}/takes/${props.take.id}/mixes/${mix.id}/retry`, { method: 'POST' })
    emit('changed')
  }
  catch (e) {
    actionError.value = describeError(e)
  }
  finally {
    busyId.value = null
  }
}

async function confirmDelete() {
  const mixId = pendingDeleteId.value
  if (!mixId) return
  busyId.value = mixId
  actionError.value = null
  try {
    await $fetch(`/api/tracks/${props.trackId}/takes/${props.take.id}/mixes/${mixId}`, { method: 'DELETE' })
    pendingDeleteId.value = null
    emit('changed')
  }
  catch (e) {
    actionError.value = describeError(e)
  }
  finally {
    busyId.value = null
  }
}
</script>

<template>
  <div>
    <p
      v-if="mixes.length === 0"
      class="text-xs text-text-muted"
    >
      No Mixes rendered yet.
    </p>

    <ul
      v-else
      class="flex flex-col gap-3"
    >
      <li
        v-for="mix in mixes"
        :key="mix.id"
        class="rounded-[6px] bg-card p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs font-bold">
              {{ formatDate(mix.createdAt) }}
            </p>
            <p class="text-xs text-text-muted">
              {{ formatPitch(mix.pitchSemitones) }} · {{ formatTempo(mix.tempoPercent) }} ·
              vocal {{ formatGain(mix.vocalGain) }} · backing {{ formatGain(mix.backingGain) }}
            </p>
          </div>
          <button
            type="button"
            class="flex size-9 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:text-negative disabled:opacity-60"
            :disabled="busyId === mix.id"
            :aria-label="`Delete the Mix from ${formatDate(mix.createdAt)}`"
            @click="pendingDeleteId = mix.id"
          >
            <Loader2
              v-if="busyId === mix.id"
              class="size-4 animate-spin"
            />
            <Trash2
              v-else
              class="size-4"
            />
          </button>
        </div>

        <AudioPlayer
          v-if="mix.mp3Path"
          class="mt-3"
          :src="audioUrl(mix)"
          :aria-label="`Playback for the Mix from ${formatDate(mix.createdAt)}`"
        >
          <template #actions>
            <a
              :href="audioUrl(mix)"
              download
              class="inline-flex h-8 shrink-0 items-center gap-1 rounded-pill bg-surface px-2.5 text-[10px] font-bold uppercase tracking-wide text-text-muted transition hover:bg-card hover:text-text"
              aria-label="Download the MP3"
            >
              <Download class="size-3" />
              MP3
            </a>
            <a
              v-if="mix.wavPath"
              :href="audioUrl(mix, 'wav')"
              download
              class="inline-flex h-8 shrink-0 items-center gap-1 rounded-pill bg-surface px-2.5 text-[10px] font-bold uppercase tracking-wide text-text-muted transition hover:bg-card hover:text-text"
              aria-label="Download the WAV"
            >
              <Download class="size-3" />
              WAV
            </a>
          </template>
        </AudioPlayer>

        <div
          v-else
          class="mt-2 flex items-center gap-2 text-xs"
          :class="status(mix).failed ? 'text-negative' : 'text-text-muted'"
        >
          <XCircle
            v-if="status(mix).failed"
            class="size-4 shrink-0"
          />
          <Loader2
            v-else
            class="size-4 shrink-0 animate-spin"
          />
          <span
            class="min-w-0 flex-1 truncate"
            :title="status(mix).failed ? (mix.job?.error ?? undefined) : undefined"
          >{{ status(mix).label }}</span>
          <button
            v-if="status(mix).failed"
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-pill bg-surface px-3 py-1.5 font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
            :disabled="busyId === mix.id"
            @click="retry(mix)"
          >
            <RotateCcw class="size-3" />
            Retry
          </button>
        </div>
      </li>
    </ul>

    <p
      v-if="actionError"
      class="mt-2 text-sm text-negative"
      role="alert"
    >
      {{ actionError }}
    </p>

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      title="Delete this Mix?"
      message="This removes the rendered files. It cannot be undone."
      confirm-label="Delete"
      :busy="busyId === pendingDeleteId"
      @confirm="confirmDelete"
      @cancel="pendingDeleteId = null"
    />
  </div>
</template>
