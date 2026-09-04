<script setup lang="ts">
import { ArrowLeft, Loader2, Pause, Play, Trash2 } from 'lucide-vue-next'
import { PITCH_SEMITONES_MAX, PITCH_SEMITONES_MIN } from '~~/shared/adjustments'
import { GAIN_MAX, GAIN_MIN, LATENCY_NUDGE_MS_MAX, LATENCY_NUDGE_MS_MIN } from '~~/shared/take'

// This screen carries its own playback (the Take over the Backing Track); the
// persistent player bar would only conflict with it.
definePageMeta({ playerBar: false })

const route = useRoute()
const id = computed(() => String(route.params.id))
const takeId = computed(() => String(route.params.takeId))

const player = usePlayer()
const { track, notFound } = useTrackDetail(id)
const take = computed(() => track.value?.takes.find(t => t.id === takeId.value))
const takeMissing = computed(() => !notFound.value && track.value?.importState === 'ready' && !take.value)

const review = useTakeReview(id, take)
const state = review.state
const heardPitch = review.heardPitch

onMounted(() => {
  // Only one engine should own the speakers at a time.
  if (player.state.value.playing) player.pause()
  window.addEventListener('pagehide', review.flushSave)
})
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', review.flushSave)
  review.destroy()
})

const pendingDiscard = ref(false)

async function confirmDiscard() {
  await review.discard()
  if (state.value.error) return
  pendingDiscard.value = false
  await navigateTo(`/tracks/${id.value}`)
}

async function keep() {
  review.flushSave()
  await navigateTo(`/tracks/${id.value}`)
}

function onNudgeInput(event: Event) {
  review.setNudge(Number((event.target as HTMLInputElement).value))
}
function onVocalGainInput(event: Event) {
  review.setVocalGain(Number((event.target as HTMLInputElement).value))
}
function onBackingGainInput(event: Event) {
  review.setBackingGain(Number((event.target as HTMLInputElement).value))
}
function onPitchInput(event: Event) {
  review.setPitch(Number((event.target as HTMLInputElement).value))
}

useHead(() => ({ title: track.value ? `Review Take · ${track.value.title} · Presto` : 'Presto' }))
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 pb-12 pt-4 sm:pt-6">
    <NuxtLink
      :to="`/tracks/${id}`"
      class="mb-4 inline-flex h-11 items-center gap-2 rounded-pill pr-4 text-sm font-bold text-text-muted transition hover:text-text"
    >
      <ArrowLeft class="size-4" />
      Back to Track
    </NuxtLink>

    <section
      v-if="notFound || takeMissing"
      class="flex flex-col items-center rounded-[8px] bg-surface px-6 py-16 text-center shadow-[var(--shadow-medium)]"
    >
      <h1 class="text-lg font-semibold">
        Take not found
      </h1>
      <p class="mt-2 text-sm text-text-muted">
        It may have been deleted.
      </p>
    </section>

    <template v-else-if="track && take">
      <header class="mb-6">
        <p class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          Review Take
        </p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight">
          {{ track.title }}
        </h1>
        <p class="mt-1 text-sm text-text-muted">
          {{ formatDate(take.createdAt) }} · {{ formatDuration(take.durationMs) }} · from {{ formatDuration(take.startPositionMs) }}
        </p>
      </header>

      <section
        class="mb-4 flex flex-col items-center gap-3 rounded-[8px] bg-surface p-4 shadow-[var(--shadow-medium)] sm:p-5"
        aria-label="Playback"
      >
        <button
          type="button"
          class="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent text-ground shadow-[var(--shadow-medium)] transition hover:brightness-110 disabled:bg-surface-mid disabled:text-text-muted"
          :disabled="state.loading || state.error !== null"
          :aria-label="state.playing ? 'Pause' : 'Play the Take over the Backing Track'"
          @click="review.toggle()"
        >
          <Loader2
            v-if="state.loading"
            class="size-6 animate-spin"
          />
          <Pause
            v-else-if="state.playing"
            class="size-6"
            fill="currentColor"
          />
          <Play
            v-else
            class="size-6 translate-x-px"
            fill="currentColor"
          />
        </button>
        <div class="flex w-full items-center gap-3">
          <span class="w-12 text-right text-xs tabular-nums text-text-muted">{{ formatDuration(state.elapsedMs) }}</span>
          <div
            class="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-mid"
            role="progressbar"
            :aria-valuenow="Math.round(state.elapsedMs)"
            aria-valuemin="0"
            :aria-valuemax="take.durationMs"
          >
            <div
              class="h-full rounded-pill bg-accent transition-[width] duration-75"
              :style="{ width: `${Math.min(100, (state.elapsedMs / Math.max(take.durationMs, 1)) * 100)}%` }"
            />
          </div>
          <span class="w-12 text-xs tabular-nums text-text-muted">{{ formatDuration(take.durationMs) }}</span>
        </div>
        <p
          v-if="state.error"
          class="text-sm text-negative"
          role="alert"
        >
          {{ state.error }}
        </p>
      </section>

      <section
        class="mb-4 flex flex-col gap-5 rounded-[8px] bg-surface p-4 shadow-[var(--shadow-medium)] sm:p-5"
        aria-label="Review settings"
      >
        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <label
              for="review-nudge"
              class="text-sm font-bold"
            >Latency nudge</label>
            <output
              for="review-nudge"
              class="text-2xl font-bold tabular-nums"
            >{{ formatLatencyNudge(state.latencyNudgeMs) }}</output>
          </div>
          <input
            id="review-nudge"
            type="range"
            class="h-12 w-full cursor-pointer accent-accent"
            :min="LATENCY_NUDGE_MS_MIN"
            :max="LATENCY_NUDGE_MS_MAX"
            step="5"
            :value="state.latencyNudgeMs"
            aria-label="Latency nudge in milliseconds"
            :aria-valuetext="formatLatencyNudge(state.latencyNudgeMs)"
            @input="onNudgeInput"
          >
          <p class="mt-1 text-xs text-text-muted">
            Moves your voice earlier or later against the Backing Track. Nudge while playing to align by ear.
          </p>
        </div>

        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <label
              for="review-vocal-gain"
              class="text-sm font-bold"
            >Vocal gain</label>
            <output
              for="review-vocal-gain"
              class="text-2xl font-bold tabular-nums"
            >{{ formatGain(state.vocalGain) }}</output>
          </div>
          <input
            id="review-vocal-gain"
            type="range"
            class="h-12 w-full cursor-pointer accent-accent"
            :min="GAIN_MIN"
            :max="GAIN_MAX"
            step="0.05"
            :value="state.vocalGain"
            aria-label="Vocal gain"
            :aria-valuetext="formatGain(state.vocalGain)"
            @input="onVocalGainInput"
          >
        </div>

        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <label
              for="review-backing-gain"
              class="text-sm font-bold"
            >Backing gain</label>
            <output
              for="review-backing-gain"
              class="text-2xl font-bold tabular-nums"
            >{{ formatGain(state.backingGain) }}</output>
          </div>
          <input
            id="review-backing-gain"
            type="range"
            class="h-12 w-full cursor-pointer accent-accent"
            :min="GAIN_MIN"
            :max="GAIN_MAX"
            step="0.05"
            :value="state.backingGain"
            aria-label="Backing gain"
            :aria-valuetext="formatGain(state.backingGain)"
            @input="onBackingGainInput"
          >
        </div>

        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <label
              for="review-pitch"
              class="text-sm font-bold"
            >Backing pitch</label>
            <output
              for="review-pitch"
              class="text-2xl font-bold tabular-nums"
              :class="state.linked ? 'text-text-muted' : 'text-text'"
            >{{ formatPitch(heardPitch) }}</output>
          </div>
          <input
            id="review-pitch"
            type="range"
            class="h-12 w-full cursor-pointer accent-accent disabled:cursor-default disabled:opacity-50"
            :min="PITCH_SEMITONES_MIN"
            :max="PITCH_SEMITONES_MAX"
            step="1"
            :value="Math.round(heardPitch)"
            :disabled="state.linked"
            aria-label="Backing Track pitch in semitones"
            :aria-valuetext="formatPitch(heardPitch)"
            @input="onPitchInput"
          >
          <p
            v-if="state.linked"
            class="mt-1 text-xs text-text-muted"
          >
            Following tempo, which is locked — pitch can't move on its own.
          </p>
        </div>

        <div class="rounded-[6px] bg-surface-mid px-3 py-2">
          <p class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
            Tempo
          </p>
          <p class="mt-0.5 text-sm text-text">
            <span class="font-bold tabular-nums">{{ formatTempo(state.tempoPercent) }}</span>
            · locked, since this Take was sung at this tempo
          </p>
        </div>

        <p
          v-if="state.saveError"
          class="text-sm text-negative"
          role="alert"
        >
          Review settings could not be saved: {{ state.saveError }}
        </p>
      </section>

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="inline-flex h-14 flex-1 items-center justify-center rounded-pill bg-accent px-6 text-sm font-bold uppercase tracking-[1.4px] text-ground transition hover:brightness-110"
          @click="keep"
        >
          Keep Take
        </button>
        <button
          type="button"
          class="inline-flex h-14 items-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-negative transition hover:bg-card"
          @click="pendingDiscard = true"
        >
          <Trash2 class="size-4" />
          Discard
        </button>
      </div>

      <ConfirmDialog
        :open="pendingDiscard"
        title="Discard this Take?"
        message="This removes the Take. It cannot be undone."
        confirm-label="Discard"
        :busy="state.deleting"
        @confirm="confirmDiscard"
        @cancel="pendingDiscard = false"
      />
    </template>
  </main>
</template>
