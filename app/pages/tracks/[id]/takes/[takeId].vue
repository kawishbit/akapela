<script setup lang="ts">
import { ArrowLeft, Disc3, Loader2, Pause, Play, Trash2 } from 'lucide-vue-next'
import {
  EFFECTS_TARGETS,
  EFFECTS_TARGET_LABELS,
  LOWPASS_HZ_MAX,
  LOWPASS_HZ_MIN,
  PITCH_SEMITONES_MAX,
  PITCH_SEMITONES_MIN,
  REVERB_AMOUNT_MAX,
  REVERB_AMOUNT_MIN,
  type EffectsTarget,
} from '~~/shared/adjustments'
import { BACKING_SOURCES, BACKING_SOURCE_LABELS, type BackingSource } from '~~/shared/backing-source'
import { toMixRequest } from '~~/shared/mix'
import { GAIN_MAX, GAIN_MIN, LATENCY_NUDGE_MS_MAX, LATENCY_NUDGE_MS_MIN } from '~~/shared/take'

// This screen carries its own playback (the Take over the Backing Track); the
// persistent player bar would only conflict with it.
definePageMeta({ playerBar: false })

const route = useRoute()
const id = computed(() => String(route.params.id))
const takeId = computed(() => String(route.params.takeId))

const player = usePlayer()
const { track, notFound, refresh } = useTrackDetail(id)
const take = computed(() => track.value?.takes.find(t => t.id === takeId.value))
const takeMissing = computed(() => !notFound.value && track.value?.importState === 'ready' && !take.value)
const mixes = computed(() => track.value?.mixes.filter(mix => mix.takeId === takeId.value) ?? [])

// `track` is a cache this page shares by key with the Track detail and Sing
// pages (`useTrackDetail`), so landing here can carry over whatever one of
// those had already fetched — stale enough, in the moment right after
// recording, to be missing the Take this very page is for. One refresh
// clears that up before genuinely reporting a Take gone, held back from the
// "not found" section until the refresh has actually settled so a Take that
// is really there never flashes as missing first.
const takeRetryPending = ref(false)
const takeRetryDone = ref(false)
watch(takeMissing, async (missing) => {
  if (!missing || takeRetryDone.value || takeRetryPending.value) return
  takeRetryPending.value = true
  await refresh()
  takeRetryPending.value = false
  takeRetryDone.value = true
}, { immediate: true })
const takeNotFound = computed(() => notFound.value || (takeMissing.value && takeRetryDone.value))

const review = useTakeReview(id, take)
const state = review.state
const heardPitch = review.heardPitch

const wavRequested = ref(false)
const rendering = ref(false)
const renderError = ref<string | null>(null)

/** Renders using exactly what is on screen right now, so the Mix sounds like this playback (story 69). */
async function renderMix() {
  const current = take.value
  if (!current || rendering.value) return
  rendering.value = true
  renderError.value = null
  try {
    await $fetch(`/api/tracks/${id.value}/takes/${current.id}/mixes`, {
      method: 'POST',
      body: toMixRequest(state.value, wavRequested.value),
    })
    await refresh()
  }
  catch (e) {
    renderError.value = describeError(e)
  }
  finally {
    rendering.value = false
  }
}

// While any of this Take's Mixes is still queued or rendering, keep the page
// current so progress, completion, and failure show up without a reload.
const MIX_POLL_MS = 1000
let mixPollTimer: ReturnType<typeof setTimeout> | undefined
function stopMixPolling() {
  if (mixPollTimer) clearTimeout(mixPollTimer)
  mixPollTimer = undefined
}
function scheduleMixPoll() {
  stopMixPolling()
  if (!mixes.value.some(mix => mix.job && (mix.job.state === 'queued' || mix.job.state === 'running'))) return
  mixPollTimer = setTimeout(async () => {
    await refresh()
    scheduleMixPoll()
  }, MIX_POLL_MS)
}
watch(mixes, scheduleMixPoll, { immediate: true })

onMounted(() => {
  // Only one engine should own the speakers at a time.
  if (player.state.value.playing) player.pause()
  window.addEventListener('pagehide', review.flushSave)
})
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', review.flushSave)
  stopMixPolling()
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

// The nudge is typed rather than dragged (ticket 12): a device's real
// round-trip latency can be most of a second, and no slider travel reads
// cleanly across that range. It commits on change — Enter, a step from the
// arrow keys, or leaving the field — so a half-typed number is never mistaken
// for one, and the field is then snapped to whatever `setNudge` actually
// applied, since it rounds and clamps.
const nudgeClampNotice = ref<string | null>(null)

function onNudgeChange(event: Event) {
  const field = event.target as HTMLInputElement
  const typed = Number(field.value)
  // A number input reports anything it cannot parse as the empty string, so a
  // field left blank or holding a lone minus sign arrives the same way: not a
  // value, and not an error either — the nudge in force simply stays.
  if (field.value.trim() === '' || !Number.isFinite(typed)) {
    field.value = String(state.value.latencyNudgeMs)
    nudgeClampNotice.value = null
    return
  }
  const applied = review.setNudge(typed)
  // Saying a figure was adjusted is what keeps a clamped one from looking like
  // a control that simply ignored the singer.
  nudgeClampNotice.value = applied === Math.round(typed)
    ? null
    : `That is further than the nudge reaches; ${formatLatencyNudge(applied)} was applied.`
  // Written straight to the field rather than left to the `:value` binding,
  // which has nothing to re-render when the applied value did not change.
  field.value = String(applied)
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
function selectBackingSource(source: BackingSource) {
  if (source === state.value.backingSource) return
  review.setBackingSource(source)
}
function onReverbInput(event: Event) {
  review.setReverbAmount(Number((event.target as HTMLInputElement).value))
}
function selectEffectsTarget(target: EffectsTarget) {
  if (target === state.value.effectsTarget) return
  review.setEffectsTarget(target)
}

/** Slider steps, mapped log-scaled onto the Hz range so the low end (where the ear is sensitive) gets more of the travel. */
const LOWPASS_SLIDER_MAX = 1000
const lowpassLogMin = Math.log(LOWPASS_HZ_MIN)
const lowpassLogMax = Math.log(LOWPASS_HZ_MAX)
const lowpassSliderValue = computed(() => {
  const t = (Math.log(state.value.lowpassHz) - lowpassLogMin) / (lowpassLogMax - lowpassLogMin)
  return Math.round(t * LOWPASS_SLIDER_MAX)
})
function onLowpassInput(event: Event) {
  const sliderValue = Number((event.target as HTMLInputElement).value)
  const t = sliderValue / LOWPASS_SLIDER_MAX
  review.setLowpassHz(Math.exp(lowpassLogMin + t * (lowpassLogMax - lowpassLogMin)))
}

useHead(() => ({ title: track.value ? `Review Take · ${track.value.title} · Akapela` : 'Akapela' }))
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
      v-if="takeNotFound"
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
        aria-labelledby="review-voice-heading"
      >
        <div>
          <h2
            id="review-voice-heading"
            class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted"
          >
            Your voice
          </h2>
          <p class="mt-1 text-xs text-text-muted">
            Where your recording sits against the Backing Track, and how loud it is. What you sang is stored dry
            and stays that way.
          </p>
        </div>

        <div>
          <label
            for="review-nudge"
            class="mb-1 block text-sm font-bold"
          >Latency nudge</label>
          <div class="flex items-center gap-2">
            <input
              id="review-nudge"
              type="number"
              inputmode="numeric"
              class="h-12 w-32 rounded-[6px] border border-border-light bg-surface-mid px-3 text-right text-2xl font-bold tabular-nums text-text outline-none focus:border-text"
              :min="LATENCY_NUDGE_MS_MIN"
              :max="LATENCY_NUDGE_MS_MAX"
              step="1"
              :value="state.latencyNudgeMs"
              aria-label="Latency nudge in milliseconds"
              @change="onNudgeChange"
            >
            <span class="text-sm font-bold text-text-muted">ms</span>
          </div>
          <p class="mt-1 text-xs text-text-muted">
            Moves your voice earlier or later against the Backing Track. Type a figure and press Enter while playing to
            align by ear; anything from {{ LATENCY_NUDGE_MS_MIN }} to {{ LATENCY_NUDGE_MS_MAX }} ms.
          </p>
          <p
            v-if="nudgeClampNotice"
            class="mt-1 text-xs text-warning"
            role="status"
          >
            {{ nudgeClampNotice }}
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
      </section>

      <section
        class="mb-4 flex flex-col gap-5 rounded-[8px] bg-surface p-4 shadow-[var(--shadow-medium)] sm:p-5"
        aria-labelledby="review-backing-heading"
      >
        <div>
          <h2
            id="review-backing-heading"
            class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted"
          >
            Backing Track
          </h2>
          <p class="mt-1 text-xs text-text-muted">
            Pitch, tempo, and Backing Source only ever shape what you sang over — never the recording itself
            (ADR 0003).
          </p>
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

        <div v-if="track.hasStems">
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-bold">Backing Source</span>
          </div>
          <div
            class="flex items-center gap-1 rounded-pill bg-surface-mid p-1"
            role="group"
            aria-label="Backing Source"
          >
            <button
              v-for="source in BACKING_SOURCES"
              :key="source"
              type="button"
              class="inline-flex h-9 flex-1 items-center justify-center rounded-pill px-4 text-xs font-bold uppercase tracking-[1.4px] transition"
              :class="source === state.backingSource
                ? 'bg-text text-ground'
                : 'text-text-muted hover:text-text'"
              :aria-pressed="source === state.backingSource"
              @click="selectBackingSource(source)"
            >
              {{ BACKING_SOURCE_LABELS[source] }}
            </button>
          </div>
          <p class="mt-1 text-xs text-text-muted">
            Which audio you sang over, overridden for the next Mix only.
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
      </section>

      <section
        class="mb-4 flex flex-col gap-5 rounded-[8px] bg-surface p-4 shadow-[var(--shadow-medium)] sm:p-5"
        aria-labelledby="review-effects-heading"
      >
        <div>
          <h2
            id="review-effects-heading"
            class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted"
          >
            Effects
          </h2>
          <p class="mt-1 text-xs text-text-muted">
            Reverb and Low-pass are one set, and they go wherever this points — so they sit here rather than under
            either side.
          </p>
        </div>

        <div>
          <p class="mb-1 text-sm font-bold">
            Apply to
          </p>
          <div
            class="flex items-center gap-1 rounded-pill bg-surface-mid p-1"
            role="group"
            aria-label="Effects Target"
          >
            <button
              v-for="target in EFFECTS_TARGETS"
              :key="target"
              type="button"
              class="inline-flex h-9 flex-1 items-center justify-center rounded-pill px-3 text-xs font-bold uppercase tracking-[1.4px] transition"
              :class="target === state.effectsTarget
                ? 'bg-text text-ground'
                : 'text-text-muted hover:text-text'"
              :aria-pressed="target === state.effectsTarget"
              @click="selectEffectsTarget(target)"
            >
              {{ EFFECTS_TARGET_LABELS[target] }}
            </button>
          </div>
          <p class="mt-1 text-xs text-text-muted">
            Your recording stays dry either way — the reverb is added on the way out, at playback and again in the Mix.
          </p>
        </div>

        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <label
              for="review-reverb"
              class="text-sm font-bold"
            >Reverb</label>
            <output
              for="review-reverb"
              class="text-2xl font-bold tabular-nums"
            >{{ formatReverbAmount(state.reverbAmount) }}</output>
          </div>
          <input
            id="review-reverb"
            type="range"
            class="h-12 w-full cursor-pointer accent-accent"
            :min="REVERB_AMOUNT_MIN"
            :max="REVERB_AMOUNT_MAX"
            step="1"
            :value="state.reverbAmount"
            aria-label="Reverb amount"
            :aria-valuetext="formatReverbAmount(state.reverbAmount)"
            @input="onReverbInput"
          >
        </div>

        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <label
              for="review-lowpass"
              class="text-sm font-bold"
            >Low-pass</label>
            <output
              for="review-lowpass"
              class="text-2xl font-bold tabular-nums"
            >{{ formatLowpassHz(state.lowpassHz) }}</output>
          </div>
          <input
            id="review-lowpass"
            type="range"
            class="h-12 w-full cursor-pointer accent-accent"
            min="0"
            :max="LOWPASS_SLIDER_MAX"
            step="1"
            :value="lowpassSliderValue"
            aria-label="Low-pass cutoff"
            :aria-valuetext="formatLowpassHz(state.lowpassHz)"
            @input="onLowpassInput"
          >
        </div>

        <p
          v-if="state.saveError"
          class="text-sm text-negative"
          role="alert"
        >
          Review settings could not be saved: {{ state.saveError }}
        </p>
      </section>

      <section
        class="mb-4 flex flex-col gap-3 rounded-[8px] bg-surface p-4 shadow-[var(--shadow-medium)] sm:p-5"
        aria-label="Render"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
            Mixes
          </h2>
          <label class="flex items-center gap-2 text-sm text-text-muted">
            <input
              v-model="wavRequested"
              type="checkbox"
              class="size-4 accent-accent"
            >
            Also render WAV
          </label>
        </div>

        <button
          type="button"
          class="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
          :disabled="rendering"
          @click="renderMix"
        >
          <Loader2
            v-if="rendering"
            class="size-4 animate-spin"
          />
          <Disc3
            v-else
            class="size-4"
          />
          Render Mix
        </button>
        <p
          v-if="renderError"
          class="text-sm text-negative"
          role="alert"
        >
          {{ renderError }}
        </p>

        <MixList
          v-if="mixes.length > 0"
          :track-id="id"
          :take="take"
          :mixes="mixes"
          @changed="refresh()"
        />
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
