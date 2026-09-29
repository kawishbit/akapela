<script setup lang="ts">
import { Download, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-vue-next'
import type { Take } from '~~/server/db/schema'
import type { MixWithJob } from '~~/server/lib/mixes'
import type { ErrorText } from '~/utils/errors'

const props = defineProps<{ trackId: string, take: Take, mixes: MixWithJob[] }>()
const emit = defineEmits<{ changed: [] }>()

const { t, locale } = useI18n()

const busyId = ref<string | null>(null)
const pendingDeleteId = ref<string | null>(null)
const actionError = ref<ErrorText | null>(null)

function audioUrl(mix: MixWithJob, format?: 'wav') {
  const base = `/api/tracks/${props.trackId}/takes/${props.take.id}/mixes/${mix.id}/audio`
  return format ? `${base}?format=${format}` : base
}

function status(mix: MixWithJob): { label: string, details: string | null, progress: number | null, failed: boolean } {
  const job = mix.job
  if (mix.mp3Path) return { label: t('mixList.ready'), details: null, progress: null, failed: false }
  if (!job || job.state === 'queued') return { label: t('mixList.waiting'), details: null, progress: 0, failed: false }
  if (job.state === 'running') {
    return { label: t('mixList.renderingProgress', { progress: job.progress }), details: null, progress: job.progress, failed: false }
  }
  if (job.state === 'failed') {
    const { message, details } = describeJobFailure(job, t)
    return { label: message, details, progress: null, failed: true }
  }
  return { label: t('mixList.rendering'), details: null, progress: null, failed: false }
}

async function retry(mix: MixWithJob) {
  busyId.value = mix.id
  actionError.value = null
  try {
    await $fetch(`/api/tracks/${props.trackId}/takes/${props.take.id}/mixes/${mix.id}/retry`, { method: 'POST' })
    emit('changed')
  }
  catch (e) {
    actionError.value = describeError(e, t)
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
    actionError.value = describeError(e, t)
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
      {{ t('mixList.empty') }}
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
              {{ formatDate(mix.createdAt, locale) }}
            </p>
            <p class="text-xs text-text-muted">
              {{ t('mixList.summary', {
                pitch: formatPitch(mix.pitchSemitones),
                tempo: formatTempo(mix.tempoPercent),
                vocal: formatGain(mix.vocalGain),
                backing: formatGain(mix.backingGain),
              }) }}
            </p>
          </div>
          <button
            type="button"
            class="flex size-9 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:text-negative disabled:opacity-60"
            :disabled="busyId === mix.id"
            :aria-label="t('mixList.deleteLabel', { date: formatDate(mix.createdAt, locale) })"
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
          :aria-label="t('mixList.playback', { date: formatDate(mix.createdAt, locale) })"
        >
          <template #actions>
            <a
              :href="audioUrl(mix)"
              download
              class="inline-flex h-8 shrink-0 items-center gap-1 rounded-pill bg-surface px-2.5 text-[10px] font-bold uppercase tracking-wide text-text-muted transition hover:bg-card hover:text-text"
              :aria-label="t('mixList.downloadMp3')"
            >
              <Download class="size-3" />
              MP3
            </a>
            <a
              v-if="mix.wavPath"
              :href="audioUrl(mix, 'wav')"
              download
              class="inline-flex h-8 shrink-0 items-center gap-1 rounded-pill bg-surface px-2.5 text-[10px] font-bold uppercase tracking-wide text-text-muted transition hover:bg-card hover:text-text"
              :aria-label="t('mixList.downloadWav')"
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
            :title="status(mix).details ?? undefined"
          >{{ status(mix).label }}</span>
          <button
            v-if="status(mix).failed"
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-pill bg-surface px-3 py-1.5 font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
            :disabled="busyId === mix.id"
            @click="retry(mix)"
          >
            <RotateCcw class="size-3" />
            {{ t('common.retry') }}
          </button>
        </div>
      </li>
    </ul>

    <ErrorMessage
      class="mt-2"
      :error="actionError"
    />

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      :title="t('mixList.deleteTitle')"
      :message="t('mixList.deleteMessage')"
      :confirm-label="t('mixList.delete')"
      :busy="busyId === pendingDeleteId"
      @confirm="confirmDelete"
      @cancel="pendingDeleteId = null"
    />
  </div>
</template>
