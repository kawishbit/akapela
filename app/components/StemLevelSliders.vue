<script setup lang="ts">
import { STEM_LEVEL_MAX, STEM_LEVEL_MIN, type StemLevels } from '~~/shared/backing-source'

/**
 * The two Stem Levels, Guide Vocal and Instrumental, as the same sliders the
 * Adjustments panel uses. Wherever the singer chooses what to sing over —
 * the Track page, the Sing screen, Review — they are these two, and every
 * move is emitted whole so the caller hears it live and remembers it.
 *
 * `disabled` keeps them on screen while the Backing Source is Original, so the
 * remembered levels can be seen, and says why.
 */
const props = defineProps<{ levels: StemLevels, disabled?: boolean }>()
const emit = defineEmits<{ change: [levels: StemLevels] }>()

const { t } = useI18n()
const id = useId()

/** The sliders step in whole percent; the levels themselves are 0 to 1. */
const PERCENT_MAX = 100

const sliders = computed(() => [
  { key: 'guideVocal' as const, label: t('stemLevels.guideVocal'), aria: t('stemLevels.guideVocalSlider') },
  { key: 'instrumental' as const, label: t('stemLevels.instrumental'), aria: t('stemLevels.instrumentalSlider') },
])

function onInput(key: keyof StemLevels, event: Event) {
  const percent = Number((event.target as HTMLInputElement).value)
  const level = Math.max(STEM_LEVEL_MIN, Math.min(STEM_LEVEL_MAX, Math.round(percent) / PERCENT_MAX))
  if (level !== props.levels[key]) emit('change', { ...props.levels, [key]: level })
}
</script>

<template>
  <div
    class="flex flex-col gap-3"
    role="group"
    :aria-label="t('stemLevels.heading')"
    :aria-describedby="`${id}-hint`"
  >
    <div
      v-for="slider in sliders"
      :key="slider.key"
    >
      <div class="mb-1 flex items-baseline justify-between">
        <label
          :for="`${id}-${slider.key}`"
          class="text-sm font-bold"
          :class="{ 'text-text-muted': disabled }"
        >{{ slider.label }}</label>
        <output
          :for="`${id}-${slider.key}`"
          class="text-2xl font-bold tabular-nums"
          :class="{ 'text-text-muted': disabled }"
        >{{ formatStemLevel(levels[slider.key]) }}</output>
      </div>
      <input
        :id="`${id}-${slider.key}`"
        type="range"
        class="h-12 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-60"
        :min="STEM_LEVEL_MIN * PERCENT_MAX"
        :max="STEM_LEVEL_MAX * PERCENT_MAX"
        step="1"
        :value="Math.round(levels[slider.key] * PERCENT_MAX)"
        :disabled="disabled"
        :aria-label="slider.aria"
        :aria-valuetext="formatStemLevel(levels[slider.key])"
        @input="onInput(slider.key, $event)"
      >
    </div>
    <p
      :id="`${id}-hint`"
      class="text-sm text-text-muted"
    >
      {{ disabled ? t('stemLevels.waitingForStems') : t('stemLevels.hint') }}
    </p>
  </div>
</template>
