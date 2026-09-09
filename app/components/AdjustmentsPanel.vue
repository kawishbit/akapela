<script setup lang="ts">
import { ChevronDown, Link2, Link2Off, Loader2, Minus, Plus, RotateCcw, X } from 'lucide-vue-next'
import {
  DEFAULT_ADJUSTMENTS,
  LOWPASS_HZ_MAX,
  LOWPASS_HZ_MIN,
  PITCH_SEMITONES_MAX,
  PITCH_SEMITONES_MIN,
  REVERB_AMOUNT_MAX,
  REVERB_AMOUNT_MIN,
  TEMPO_PERCENT_MAX,
  TEMPO_PERCENT_MIN,
  effectivePitchSemitones,
  type Adjustments,
} from '~~/shared/adjustments'
import { presetAdjustments } from '~~/shared/preset'

const props = defineProps<{ adjustments: Adjustments }>()
const emit = defineEmits<{ change: [patch: Partial<Adjustments>], reset: [] }>()

const presets = usePresets()

/** A tap applies all five fields at once, through the same path Reset already uses. */
function applyPreset(id: string) {
  const preset = presets.list.value.find(p => p.id === id)
  if (preset) emit('change', presetAdjustments(preset))
}

const savingAs = ref(false)
const saveName = ref('')

function startSaveAs() {
  saveName.value = ''
  savingAs.value = true
}

function cancelSaveAs() {
  savingAs.value = false
}

async function confirmSaveAs() {
  const name = saveName.value.trim()
  if (!name) return
  if (await presets.save(name, props.adjustments)) savingAs.value = false
}

async function deletePreset(id: string) {
  await presets.remove(id)
}

const isDefault = computed(() =>
  props.adjustments.pitchSemitones === DEFAULT_ADJUSTMENTS.pitchSemitones
  && props.adjustments.tempoPercent === DEFAULT_ADJUSTMENTS.tempoPercent
  && props.adjustments.linked === DEFAULT_ADJUSTMENTS.linked
  && props.adjustments.reverbAmount === DEFAULT_ADJUSTMENTS.reverbAmount
  && props.adjustments.lowpassHz === DEFAULT_ADJUSTMENTS.lowpassHz,
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

function setReverb(amount: number) {
  const clamped = Math.max(REVERB_AMOUNT_MIN, Math.min(REVERB_AMOUNT_MAX, Math.round(amount)))
  if (clamped !== props.adjustments.reverbAmount) emit('change', { reverbAmount: clamped })
}

function onReverbInput(event: Event) {
  setReverb(Number((event.target as HTMLInputElement).value))
}

/** Slider steps, mapped log-scaled onto the Hz range so the low end (where the ear is sensitive) gets more of the travel. */
const LOWPASS_SLIDER_MAX = 1000
const lowpassLogMin = Math.log(LOWPASS_HZ_MIN)
const lowpassLogMax = Math.log(LOWPASS_HZ_MAX)

const lowpassSliderValue = computed(() => {
  const t = (Math.log(props.adjustments.lowpassHz) - lowpassLogMin) / (lowpassLogMax - lowpassLogMin)
  return Math.round(t * LOWPASS_SLIDER_MAX)
})

function setLowpass(hz: number) {
  const clamped = Math.max(LOWPASS_HZ_MIN, Math.min(LOWPASS_HZ_MAX, Math.round(hz)))
  if (clamped !== props.adjustments.lowpassHz) emit('change', { lowpassHz: clamped })
}

function onLowpassInput(event: Event) {
  const sliderValue = Number((event.target as HTMLInputElement).value)
  const t = sliderValue / LOWPASS_SLIDER_MAX
  setLowpass(Math.exp(lowpassLogMin + t * (lowpassLogMax - lowpassLogMin)))
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
      <div
        class="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Presets"
      >
        <div
          v-for="preset in presets.list.value"
          :key="preset.id"
          class="group/pill relative"
        >
          <button
            type="button"
            class="inline-flex h-10 items-center rounded-pill bg-surface-mid pl-4 pr-4 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
            :class="{ 'pr-8': !preset.builtIn }"
            @click="applyPreset(preset.id)"
          >
            {{ preset.name }}
          </button>
          <button
            v-if="!preset.builtIn"
            type="button"
            class="absolute inset-y-0 right-1 flex w-6 items-center justify-center text-text-muted opacity-0 transition hover:text-negative focus-visible:opacity-100 group-hover/pill:opacity-100"
            :aria-label="`Delete Preset ${preset.name}`"
            @click="deletePreset(preset.id)"
          >
            <X class="size-3.5" />
          </button>
        </div>

        <form
          v-if="savingAs"
          class="flex items-center gap-1.5"
          @submit.prevent="confirmSaveAs"
        >
          <input
            v-model="saveName"
            type="text"
            autofocus
            placeholder="Preset name"
            maxlength="60"
            class="h-10 w-36 rounded-pill border border-border-light bg-surface px-3 text-xs font-bold text-text outline-none focus:border-text"
            @keydown.escape="cancelSaveAs"
          >
          <button
            type="submit"
            class="flex h-10 items-center rounded-pill bg-accent px-3 text-xs font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110 disabled:opacity-60"
            :disabled="presets.saving.value || saveName.trim().length === 0"
          >
            <Loader2
              v-if="presets.saving.value"
              class="size-3.5 animate-spin"
            />
            <span v-else>Save</span>
          </button>
          <button
            type="button"
            class="flex size-10 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
            aria-label="Cancel saving Preset"
            @click="cancelSaveAs"
          >
            <X class="size-4" />
          </button>
        </form>
        <button
          v-else
          type="button"
          class="inline-flex h-10 items-center gap-1.5 rounded-pill border border-dashed border-border-light px-4 text-xs font-bold uppercase tracking-[1.4px] text-text-muted transition hover:border-text hover:text-text"
          @click="startSaveAs"
        >
          <Plus class="size-3.5" />
          Save current as…
        </button>
      </div>

      <p
        v-if="presets.saveError.value"
        class="text-sm text-negative"
        role="alert"
      >
        {{ presets.saveError.value }}
      </p>

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
        :class="adjustments.linked ? 'bg-accent text-accent-ink hover:brightness-110' : 'bg-surface-mid text-text hover:bg-card'"
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

      <details class="group border-t border-border-light pt-4">
        <summary class="flex cursor-pointer list-none items-center justify-between text-sm font-bold [&::-webkit-details-marker]:hidden">
          Effects
          <ChevronDown class="size-4 text-text-muted transition-transform group-open:rotate-180" />
        </summary>

        <div class="mt-4 flex flex-col gap-5">
          <div>
            <div class="mb-1 flex items-baseline justify-between">
              <label
                for="adjust-reverb"
                class="text-sm font-bold"
              >Reverb</label>
              <output
                for="adjust-reverb"
                class="text-2xl font-bold tabular-nums"
              >{{ formatReverbAmount(adjustments.reverbAmount) }}</output>
            </div>
            <input
              id="adjust-reverb"
              type="range"
              class="h-12 w-full cursor-pointer accent-accent"
              :min="REVERB_AMOUNT_MIN"
              :max="REVERB_AMOUNT_MAX"
              step="1"
              :value="adjustments.reverbAmount"
              aria-label="Reverb amount"
              :aria-valuetext="formatReverbAmount(adjustments.reverbAmount)"
              @input="onReverbInput"
            >
          </div>

          <div>
            <div class="mb-1 flex items-baseline justify-between">
              <label
                for="adjust-lowpass"
                class="text-sm font-bold"
              >Low-pass</label>
              <output
                for="adjust-lowpass"
                class="text-2xl font-bold tabular-nums"
              >{{ formatLowpassHz(adjustments.lowpassHz) }}</output>
            </div>
            <input
              id="adjust-lowpass"
              type="range"
              class="h-12 w-full cursor-pointer accent-accent"
              min="0"
              :max="LOWPASS_SLIDER_MAX"
              step="1"
              :value="lowpassSliderValue"
              aria-label="Low-pass cutoff"
              :aria-valuetext="formatLowpassHz(adjustments.lowpassHz)"
              @input="onLowpassInput"
            >
          </div>
        </div>
      </details>
    </div>
  </section>
</template>
