<script setup lang="ts">
import { Loader2, Pause, Play } from 'lucide-vue-next'

const props = defineProps<{ src: string, ariaLabel?: string }>()

const audioEl = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const buffering = ref(false)
const durationMs = ref<number | null>(null)
const positionMs = ref(0)
const error = ref(false)

function onLoadedMetadata() {
  const duration = audioEl.value?.duration
  durationMs.value = duration !== undefined && Number.isFinite(duration) ? duration * 1000 : null
}
function onTimeUpdate() {
  if (audioEl.value) positionMs.value = audioEl.value.currentTime * 1000
}
function onEnded() {
  playing.value = false
}

function toggle() {
  const audio = audioEl.value
  if (!audio || error.value) return
  if (audio.paused) audio.play().catch(() => { error.value = true })
  else audio.pause()
}

function onSeek(event: Event) {
  const audio = audioEl.value
  if (!audio) return
  const ms = Number((event.target as HTMLInputElement).value)
  audio.currentTime = ms / 1000
  positionMs.value = ms
}

// Watching `props.src` remembers that a Mix's audio comes and goes as it
// re-renders (retried, deleted, re-rendered): each is a fresh `<audio>`
// source, never a seek within the same one.
watch(() => props.src, () => {
  playing.value = false
  buffering.value = false
  durationMs.value = null
  positionMs.value = 0
  error.value = false
})
</script>

<template>
  <div
    class="flex flex-col gap-1.5"
    role="group"
    :aria-label="ariaLabel ?? 'Audio player'"
  >
    <!-- `sr-only`, not `hidden`: Chrome skips preloading metadata for a
         `display:none` media element, which is exactly what `preload="metadata"`
         is here for. -->
    <audio
      ref="audioEl"
      class="sr-only"
      preload="metadata"
      :src="src"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @play="playing = true"
      @pause="playing = false"
      @ended="onEnded"
      @waiting="buffering = true"
      @playing="buffering = false"
      @error="error = true"
    />

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:brightness-110 disabled:bg-surface-mid disabled:text-text-muted"
        :disabled="error"
        :aria-label="playing ? 'Pause' : 'Play'"
        @click="toggle"
      >
        <Loader2
          v-if="buffering"
          class="size-4 animate-spin"
        />
        <Pause
          v-else-if="playing"
          class="size-4"
          fill="currentColor"
        />
        <Play
          v-else
          class="size-4 translate-x-px"
          fill="currentColor"
        />
      </button>

      <template v-if="error">
        <p class="min-w-0 flex-1 text-xs text-negative">
          Couldn't load audio
        </p>
      </template>
      <template v-else>
        <span class="w-9 shrink-0 text-right text-xs tabular-nums text-text-muted">{{ formatDuration(positionMs) }}</span>
        <input
          type="range"
          class="h-9 min-w-0 flex-1 cursor-pointer accent-accent"
          min="0"
          :max="Math.max(durationMs ?? 1, 1)"
          step="100"
          :value="positionMs"
          aria-label="Seek"
          :aria-valuetext="formatDuration(positionMs)"
          @input="onSeek"
        >
        <span class="w-9 shrink-0 text-xs tabular-nums text-text-muted">{{ formatDuration(durationMs) }}</span>
      </template>
    </div>

    <div
      v-if="$slots.actions"
      class="flex shrink-0 items-center justify-end gap-1.5"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
