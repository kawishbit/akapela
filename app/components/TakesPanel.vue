<script setup lang="ts">
import { Disc3, Loader2, Mic2, Trash2 } from 'lucide-vue-next'
import type { TrackDetail } from '~~/server/lib/tracks'
import { toMixRequest } from '~~/shared/mix'

const props = defineProps<{ track: TrackDetail }>()
const emit = defineEmits<{ changed: [] }>()

const deletingId = ref<string | null>(null)
const pendingDeleteId = ref<string | null>(null)
const renderingId = ref<string | null>(null)
const actionError = ref<string | null>(null)

function mixesFor(takeId: string) {
  return props.track.mixes.filter(mix => mix.takeId === takeId)
}

async function confirmDelete() {
  const takeId = pendingDeleteId.value
  if (!takeId) return
  deletingId.value = takeId
  actionError.value = null
  try {
    await $fetch(`/api/tracks/${props.track.id}/takes/${takeId}`, { method: 'DELETE' })
    pendingDeleteId.value = null
    emit('changed')
  }
  catch (error) {
    actionError.value = describeError(error)
  }
  finally {
    deletingId.value = null
  }
}

/** One-tap render (story 68): a fresh Mix using exactly what the Take is already saved with. */
async function render(take: TrackDetail['takes'][number]) {
  renderingId.value = take.id
  actionError.value = null
  try {
    await $fetch(`/api/tracks/${props.track.id}/takes/${take.id}/mixes`, {
      method: 'POST',
      body: toMixRequest({
        ...take.adjustments,
        backingSource: take.backingSource,
        latencyNudgeMs: take.latencyNudgeMs,
        vocalGain: take.vocalGain,
        backingGain: take.backingGain,
      }, false),
    })
    emit('changed')
  }
  catch (error) {
    actionError.value = describeError(error)
  }
  finally {
    renderingId.value = null
  }
}
</script>

<template>
  <section class="rounded-[8px] bg-surface p-4 sm:p-5">
    <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
      Takes
    </h2>

    <p
      v-if="track.takes.length === 0"
      class="mt-2 text-sm text-text-muted"
    >
      Sing to record your first Take.
    </p>

    <ul
      v-else
      class="mt-3 flex flex-col divide-y divide-border/30"
    >
      <li
        v-for="take in track.takes"
        :key="take.id"
        class="py-3 first:pt-0 last:pb-0"
      >
        <div class="flex items-center gap-3">
          <Mic2 class="size-4 shrink-0 text-text-muted" />
          <NuxtLink
            :to="`/tracks/${track.id}/takes/${take.id}`"
            class="min-w-0 flex-1 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-text"
          >
            <p class="truncate text-sm font-bold">
              {{ formatDate(take.createdAt) }}
            </p>
            <p class="truncate text-xs text-text-muted">
              {{ formatDuration(take.durationMs) }} · from {{ formatDuration(take.startPositionMs) }}
            </p>
          </NuxtLink>
          <button
            type="button"
            class="flex h-10 shrink-0 items-center gap-1.5 rounded-pill bg-surface-mid px-3 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
            :disabled="renderingId === take.id"
            :aria-label="`Render a Mix from the Take from ${formatDate(take.createdAt)}`"
            @click="render(take)"
          >
            <Loader2
              v-if="renderingId === take.id"
              class="size-3.5 animate-spin"
            />
            <Disc3
              v-else
              class="size-3.5"
            />
            Render
          </button>
          <button
            type="button"
            class="flex size-10 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:text-negative disabled:opacity-60"
            :disabled="deletingId === take.id"
            :aria-label="`Delete the Take from ${formatDate(take.createdAt)}`"
            @click="pendingDeleteId = take.id"
          >
            <Loader2
              v-if="deletingId === take.id"
              class="size-4 animate-spin"
            />
            <Trash2
              v-else
              class="size-4"
            />
          </button>
        </div>

        <MixList
          v-if="mixesFor(take.id).length > 0"
          class="ml-7 mt-3"
          :track-id="track.id"
          :take="take"
          :mixes="mixesFor(take.id)"
          @changed="emit('changed')"
        />
      </li>
    </ul>

    <p
      v-if="actionError"
      class="mt-3 text-sm text-negative"
      role="alert"
    >
      {{ actionError }}
    </p>

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      title="Delete this Take?"
      message="This removes the Take and any Mixes rendered from it. It cannot be undone."
      confirm-label="Delete"
      :busy="deletingId !== null"
      @confirm="confirmDelete"
      @cancel="pendingDeleteId = null"
    />
  </section>
</template>
