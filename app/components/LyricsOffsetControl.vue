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
  if (offsetMs === shownOffsetMs.value) return false
  shownOffsetMs.value = offsetMs
  emit('change', offsetMs)
  return true
}

/**
 * Holding a button repeats the nudge and accelerates, so a ten-second
 * correction — a karaoke intro that runs long — is a beat of holding rather
 * than a hundred taps, while a single tap still moves by exactly a tenth of a
 * second for the last-inch precision that calls for. Driven off `click`
 * (which a plain tap, and a keyboard Enter/Space on the button, both already
 * fire) so a quick tap keeps behaving exactly as before; `pointerdown` only
 * arms a delayed, accelerating repeat behind it for a press that keeps going.
 */
const HOLD_DELAY_MS = 350
const HOLD_TICK_MS = 60
/** Steps per tick (tenths of a second), ramping up the longer the button stays held. */
function holdStepAt(elapsedMs: number): number {
  if (elapsedMs < 1000) return 1
  if (elapsedMs < 2500) return 5
  return 10
}

let holdTimer: ReturnType<typeof setTimeout> | undefined
let holdStartedAt = 0
/** Whether the repeat actually kicked in, so the `click` that follows releasing it is not one nudge too many. */
let holdFired = false

function startHold(direction: 1 | -1) {
  stopHold()
  holdStartedAt = Date.now()
  holdTimer = setTimeout(() => {
    holdFired = true
    holdTimer = setInterval(() => {
      const moved = set(nudgeLyricsOffset(shownOffsetMs.value, direction * holdStepAt(Date.now() - holdStartedAt)))
      // Hit the bound; nothing left to repeat toward.
      if (!moved) stopHold()
    }, HOLD_TICK_MS)
  }, HOLD_DELAY_MS)
}

function stopHold() {
  clearTimeout(holdTimer)
  clearInterval(holdTimer)
  holdTimer = undefined
}

function tap(direction: 1 | -1) {
  if (holdFired) {
    holdFired = false
    return
  }
  set(nudgeLyricsOffset(shownOffsetMs.value, direction))
}

onBeforeUnmount(stopHold)
</script>

<template>
  <div class="flex items-center gap-1 rounded-pill bg-surface-mid/80 p-1 backdrop-blur">
    <button
      type="button"
      class="flex size-9 items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-text disabled:opacity-40"
      :disabled="shownOffsetMs <= LYRICS_OFFSET_MIN_MS"
      aria-label="Lyrics Offset earlier by a tenth of a second, held to move faster"
      @click="tap(-1)"
      @pointerdown="startHold(-1)"
      @pointerup="stopHold"
      @pointerleave="stopHold"
      @pointercancel="stopHold"
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
      aria-label="Lyrics Offset later by a tenth of a second, held to move faster"
      @click="tap(1)"
      @pointerdown="startHold(1)"
      @pointerup="stopHold"
      @pointerleave="stopHold"
      @pointercancel="stopHold"
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
