<script setup lang="ts">
import { Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-vue-next'
import { effectivePitchSemitones } from '~~/shared/adjustments'
import { VOLUME_MAX, VOLUME_MIN } from '~/audio/volume'

const player = usePlayer()
const state = player.state

/** Position shown while the thumb is being dragged, before the seek is committed. */
const scrubbing = ref<number | null>(null)
const shownMs = computed(() => scrubbing.value ?? state.value.positionMs)
const remainingMs = computed(() => Math.max(0, state.value.durationMs - shownMs.value))
const seekable = computed(() => state.value.track !== null && !state.value.loading && !state.value.error)

const adjustmentsLabel = computed(() => {
  const adjustments = state.value.adjustments
  return `${formatPitch(effectivePitchSemitones(adjustments))} · ${formatTempo(adjustments.tempoPercent)}`
})

function onScrub(event: Event) {
  scrubbing.value = Number((event.target as HTMLInputElement).value)
}

function onSeek(event: Event) {
  const positionMs = Number((event.target as HTMLInputElement).value)
  scrubbing.value = null
  player.seek(positionMs)
}

function onVolumeInput(event: Event) {
  player.setVolume(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <footer
    class="fixed inset-x-0 bottom-0 z-20 bg-ground/95 shadow-[0_-1px_0_var(--color-surface-mid)] backdrop-blur"
    style="padding-bottom: env(safe-area-inset-bottom)"
    aria-label="Player"
  >
    <div class="mx-auto max-w-6xl px-4 py-2">
      <div class="flex items-center gap-3">
        <template v-if="state.track">
          <NuxtLink
            :to="`/tracks/${state.track.id}`"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-text"
          >
            <img
              :src="`/api/tracks/${state.track.id}/cover?v=${state.track.coverVersion}`"
              :alt="`Cover art for ${state.track.title}`"
              class="size-11 shrink-0 rounded-[6px] bg-surface-mid object-cover"
              width="44"
              height="44"
            >
            <div class="min-w-0">
              <p class="truncate text-sm font-bold text-text">
                {{ state.track.title }}
              </p>
              <p
                v-if="state.error"
                class="truncate text-xs text-negative"
              >
                {{ state.error }}
              </p>
              <p
                v-else
                class="truncate text-xs text-text-muted"
              >
                <span>{{ state.track.artist ?? 'Unknown artist' }}</span>
                <span aria-hidden="true"> · </span>
                <span aria-label="Adjustments">{{ adjustmentsLabel }}</span>
              </p>
            </div>
          </NuxtLink>

          <div class="hidden flex-[1.4] items-center gap-3 sm:flex">
            <span class="w-12 text-right text-xs tabular-nums text-text-muted">{{ formatDuration(shownMs) }}</span>
            <input
              type="range"
              class="h-11 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-default"
              min="0"
              :max="Math.max(state.durationMs, 1)"
              step="100"
              :value="shownMs"
              :disabled="!seekable"
              aria-label="Seek"
              @input="onScrub"
              @change="onSeek"
            >
            <span class="w-12 text-xs tabular-nums text-text-muted">-{{ formatDuration(remainingMs) }}</span>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <VolumeX
              v-if="state.volume <= VOLUME_MIN"
              class="size-4 shrink-0 text-text-muted"
              aria-hidden="true"
            />
            <Volume2
              v-else
              class="size-4 shrink-0 text-text-muted"
              aria-hidden="true"
            />
            <input
              type="range"
              class="h-11 w-14 cursor-pointer accent-accent sm:w-24"
              :min="VOLUME_MIN"
              :max="VOLUME_MAX"
              step="0.01"
              :value="state.volume"
              aria-label="Backing Track volume"
              :aria-valuetext="formatGain(state.volume)"
              @input="onVolumeInput"
            >
          </div>

          <button
            type="button"
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-ground transition hover:brightness-110 disabled:bg-surface-mid disabled:text-text-muted"
            :disabled="!seekable"
            :aria-label="state.playing ? 'Pause' : 'Play'"
            @click="player.toggle()"
          >
            <Loader2
              v-if="state.loading"
              class="size-5 animate-spin"
            />
            <Pause
              v-else-if="state.playing"
              class="size-5"
              fill="currentColor"
            />
            <Play
              v-else
              class="size-5 translate-x-px"
              fill="currentColor"
            />
          </button>
        </template>

        <template v-else>
          <div
            class="size-11 shrink-0 rounded-[6px] bg-surface-mid"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-text">
              Nothing playing
            </p>
            <p class="truncate text-xs text-text-muted">
              Open a Track to play its Backing Track
            </p>
          </div>
          <button
            type="button"
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-mid text-text-muted"
            disabled
            aria-label="Play"
          >
            <Play
              class="size-5 translate-x-px"
              fill="currentColor"
            />
          </button>
        </template>
      </div>

      <div
        v-if="state.track"
        class="mt-1 flex items-center gap-3 sm:hidden"
      >
        <span class="w-12 text-right text-xs tabular-nums text-text-muted">{{ formatDuration(shownMs) }}</span>
        <input
          type="range"
          class="h-11 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-default"
          min="0"
          :max="Math.max(state.durationMs, 1)"
          step="100"
          :value="shownMs"
          :disabled="!seekable"
          aria-label="Seek"
          @input="onScrub"
          @change="onSeek"
        >
        <span class="w-12 text-xs tabular-nums text-text-muted">-{{ formatDuration(remainingMs) }}</span>
      </div>
    </div>
  </footer>
</template>
