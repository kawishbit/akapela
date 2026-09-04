<script setup lang="ts">
import { Loader2, Mic2, Trash2 } from 'lucide-vue-next'
import type { TrackDetail } from '~~/server/lib/tracks'

const props = defineProps<{ track: TrackDetail }>()
const emit = defineEmits<{ deleted: [] }>()

const deletingId = ref<string | null>(null)
const pendingDeleteId = ref<string | null>(null)
const actionError = ref<string | null>(null)

async function confirmDelete() {
  const takeId = pendingDeleteId.value
  if (!takeId) return
  deletingId.value = takeId
  actionError.value = null
  try {
    await $fetch(`/api/tracks/${props.track.id}/takes/${takeId}`, { method: 'DELETE' })
    pendingDeleteId.value = null
    emit('deleted')
  }
  catch (error) {
    actionError.value = describeError(error)
  }
  finally {
    deletingId.value = null
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
        class="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
      >
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
      message="This removes the Take. It cannot be undone."
      confirm-label="Delete"
      :busy="deletingId !== null"
      @confirm="confirmDelete"
      @cancel="pendingDeleteId = null"
    />
  </section>
</template>
