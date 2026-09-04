<script setup lang="ts">
import { Minus, Plus, RotateCcw } from 'lucide-vue-next'
import { LYRICS_OFFSET_MAX_MS, LYRICS_OFFSET_MIN_MS, nudgeLyricsOffset } from '~~/shared/lyrics'

const props = defineProps<{ offsetMs: number }>()
const emit = defineEmits<{ change: [offsetMs: number] }>()

/**
 * The prop only catches up on the next render, so a run of quick taps — which
 * is how a singer finds the right offset — would all count from the same
 * starting value. Each tap counts from what this control last emitted instead.
 */
const shownOffsetMs = ref(props.offsetMs)
watch(() => props.offsetMs, (value) => {
  shownOffsetMs.value = value
})

function set(offsetMs: number) {
  if (offsetMs === shownOffsetMs.value) return
  shownOffsetMs.value = offsetMs
  emit('change', offsetMs)
}
</script>

<template>
  <div class="flex items-center gap-1 rounded-pill bg-surface-mid/80 p-1 backdrop-blur">
    <button
      type="button"
      class="flex size-9 items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-text disabled:opacity-40"
      :disabled="shownOffsetMs <= LYRICS_OFFSET_MIN_MS"
      aria-label="Lyrics Offset earlier by a tenth of a second"
      @click="set(nudgeLyricsOffset(shownOffsetMs, -1))"
    >
      <Minus class="size-4" />
    </button>

    <p class="min-w-20 text-center text-xs font-bold tabular-nums text-text">
      <span class="sr-only">Lyrics Offset </span>{{ formatLyricsOffset(shownOffsetMs) }}
    </p>

    <button
      type="button"
      class="flex size-9 items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-text disabled:opacity-40"
      :disabled="shownOffsetMs >= LYRICS_OFFSET_MAX_MS"
      aria-label="Lyrics Offset later by a tenth of a second"
      @click="set(nudgeLyricsOffset(shownOffsetMs, 1))"
    >
      <Plus class="size-4" />
    </button>

    <button
      v-if="shownOffsetMs !== 0"
      type="button"
      class="flex size-9 items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-text"
      aria-label="Reset the Lyrics Offset"
      @click="set(0)"
    >
      <RotateCcw class="size-4" />
    </button>
  </div>
</template>
