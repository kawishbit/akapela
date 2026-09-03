<script setup lang="ts">
import { Link2, Link2Off, Minus, Plus, RotateCcw } from 'lucide-vue-next'
import {
  DEFAULT_ADJUSTMENTS,
  PITCH_SEMITONES_MAX,
  PITCH_SEMITONES_MIN,
  TEMPO_PERCENT_MAX,
  TEMPO_PERCENT_MIN,
  effectivePitchSemitones,
  type Adjustments,
} from '~~/shared/adjustments'

const props = defineProps<{ adjustments: Adjustments }>()
const emit = defineEmits<{ change: [patch: Partial<Adjustments>], reset: [] }>()

const isDefault = computed(() =>
  props.adjustments.pitchSemitones === DEFAULT_ADJUSTMENTS.pitchSemitones
  && props.adjustments.tempoPercent === DEFAULT_ADJUSTMENTS.tempoPercent
  && props.adjustments.linked === DEFAULT_ADJUSTMENTS.linked,
)

/** The pitch actually heard: the setting, or whatever the tempo implies when linked. */
const heardPitch = computed(() => effectivePitchSemitones(props.adjustments))

function setPitch(semitones: number) {
  const clamped = Math.max(PITCH_SEMITONES_MIN, Math.min(PITCH_SEMITONES_MAX, Math.round(semitones)))
  if (clamped !== props.adjustments.pitchSemitones) emit('change', { pitchSemitones: clamped })
}

function setTempo(percent: number) {
  const clamped = Math.max(TEMPO_PERCENT_MIN, Math.min(TEMPO_PERCENT_MAX, Math.round(percent)))
  if (clamped !== props.adjustments.tempoPercent) emit('change', { tempoPercent: clamped })
}

function onPitchInput(event: Event) {
  setPitch(Number((event.target as HTMLInputElement).value))
}

function onTempoInput(event: Event) {
  setTempo(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <section
    class="rounded-[8px] bg-surface p-4 shadow-[var(--shadow-medium)] sm:p-5"
    aria-label="Adjustments"
  >
    <div class="mb-4 flex items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">
        Adjustments
      </h2>
      <button
        type="button"
        class="inline-flex h-11 items-center gap-2 rounded-pill border border-border-light px-4 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:border-text disabled:border-border disabled:text-text-muted"
        :disabled="isDefault"
        @click="emit('reset')"
      >
        <RotateCcw class="size-3.5" />
        Reset
      </button>
    </div>

    <div class="flex flex-col gap-5">
      <div>
        <div class="mb-1 flex items-baseline justify-between">
          <label
            for="adjust-pitch"
            class="text-sm font-bold"
          >Pitch</label>
          <output
            for="adjust-pitch"
            class="text-2xl font-bold tabular-nums"
            :class="adjustments.linked ? 'text-text-muted' : 'text-text'"
          >{{ formatPitch(heardPitch) }}</output>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:text-text-muted disabled:hover:bg-surface-mid"
            :disabled="adjustments.linked || adjustments.pitchSemitones <= PITCH_SEMITONES_MIN"
            aria-label="Lower pitch one semitone"
            @click="setPitch(adjustments.pitchSemitones - 1)"
          >
            <Minus class="size-5" />
          </button>
          <input
            id="adjust-pitch"
            type="range"
            class="h-12 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-default disabled:opacity-50"
            :min="PITCH_SEMITONES_MIN"
            :max="PITCH_SEMITONES_MAX"
            step="1"
            :value="Math.round(heardPitch)"
            :disabled="adjustments.linked"
            aria-label="Pitch in semitones"
            :aria-valuetext="formatPitch(heardPitch)"
            @input="onPitchInput"
          >
          <button
            type="button"
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:text-text-muted disabled:hover:bg-surface-mid"
            :disabled="adjustments.linked || adjustments.pitchSemitones >= PITCH_SEMITONES_MAX"
            aria-label="Raise pitch one semitone"
            @click="setPitch(adjustments.pitchSemitones + 1)"
          >
            <Plus class="size-5" />
          </button>
        </div>
        <p
          v-if="adjustments.linked"
          class="mt-1 text-xs text-text-muted"
        >
          Following tempo
        </p>
      </div>

      <div>
        <div class="mb-1 flex items-baseline justify-between">
          <label
            for="adjust-tempo"
            class="text-sm font-bold"
          >Tempo</label>
          <output
            for="adjust-tempo"
            class="text-2xl font-bold tabular-nums"
          >{{ formatTempo(adjustments.tempoPercent) }}</output>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:text-text-muted disabled:hover:bg-surface-mid"
            :disabled="adjustments.tempoPercent <= TEMPO_PERCENT_MIN"
            aria-label="Slow tempo one percent"
            @click="setTempo(adjustments.tempoPercent - 1)"
          >
            <Minus class="size-5" />
          </button>
          <input
            id="adjust-tempo"
            type="range"
            class="h-12 min-w-0 flex-1 cursor-pointer accent-accent"
            :min="TEMPO_PERCENT_MIN"
            :max="TEMPO_PERCENT_MAX"
            step="1"
            :value="adjustments.tempoPercent"
            aria-label="Tempo in percent"
            :aria-valuetext="formatTempo(adjustments.tempoPercent)"
            @input="onTempoInput"
          >
          <button
            type="button"
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:text-text-muted disabled:hover:bg-surface-mid"
            :disabled="adjustments.tempoPercent >= TEMPO_PERCENT_MAX"
            aria-label="Speed tempo one percent"
            @click="setTempo(adjustments.tempoPercent + 1)"
          >
            <Plus class="size-5" />
          </button>
        </div>
      </div>

      <button
        type="button"
        class="inline-flex h-12 items-center justify-center gap-2 self-start rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition"
        :class="adjustments.linked ? 'bg-accent text-ground hover:brightness-110' : 'bg-surface-mid text-text hover:bg-card'"
        :aria-pressed="adjustments.linked"
        @click="emit('change', { linked: !adjustments.linked })"
      >
        <Link2
          v-if="adjustments.linked"
          class="size-4"
        />
        <Link2Off
          v-else
          class="size-4"
        />
        Link pitch to tempo
      </button>
    </div>
  </section>
</template>
