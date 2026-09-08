/**
 * Adjustments: the playback settings applied to a Backing Track. A plain
 * parameter object consumed by the browser engine live and by the worker's
 * render step later (ADR 0003), so both sides read the same shape and the
 * same arithmetic lives here.
 */
export interface Adjustments {
  /** Whole semitones, negative to lower the key. */
  pitchSemitones: number
  /** Playback speed as a percentage of the original; 100 is unchanged. */
  tempoPercent: number
  /** When true pitch follows tempo like a turntable and `pitchSemitones` is ignored. */
  linked: boolean
  /** Dry/wet crossfade toward a reverberant signal, 0 to 100; 0 bypasses the effect entirely. */
  reverbAmount: number
  /** Low-pass cutoff in Hz, 200 to 20000; 20000 bypasses the effect entirely. */
  lowpassHz: number
  /** Which side of a Mix the Effects colour. One choice governs reverb and low-pass together. */
  effectsTarget: EffectsTarget
}

/**
 * Which side of a Mix the Effects reach: the recorded vocal, the Backing
 * Track, both, or neither. One target governs reverb and low-pass together,
 * because the domain treats them as one set (`CONTEXT.md`).
 *
 * A Mix-time parameter like Backing Source (ADR 0003 amendment): the vocal is
 * always recorded dry, and a dry signal can be coloured at playback or render
 * time without having been recorded any differently.
 */
export const EFFECTS_TARGETS = ['vocal', 'backing', 'both', 'none'] as const
export type EffectsTarget = (typeof EFFECTS_TARGETS)[number]

/** What the picker on the Review screen calls each one; one word each, the way Backing Source's are. */
export const EFFECTS_TARGET_LABELS: Record<EffectsTarget, string> = {
  vocal: 'Vocal',
  backing: 'Backing',
  both: 'Both',
  none: 'None',
}

/** Whether the Effects reach the recorded vocal under this target. */
export function effectsReachVocal(target: EffectsTarget): boolean {
  return target === 'vocal' || target === 'both'
}

/** Whether the Effects reach the Backing Track under this target. */
export function effectsReachBacking(target: EffectsTarget): boolean {
  return target === 'backing' || target === 'both'
}

export const PITCH_SEMITONES_MIN = -12
export const PITCH_SEMITONES_MAX = 12
export const TEMPO_PERCENT_MIN = 50
export const TEMPO_PERCENT_MAX = 150
export const REVERB_AMOUNT_MIN = 0
export const REVERB_AMOUNT_MAX = 100
export const LOWPASS_HZ_MIN = 200
export const LOWPASS_HZ_MAX = 20000

/** The Backing Track alone — what the Effects have always coloured, so a stored row that predates the field keeps meaning what it meant. */
export const DEFAULT_EFFECTS_TARGET: EffectsTarget = 'backing'

export const DEFAULT_ADJUSTMENTS: Readonly<Adjustments> = Object.freeze({
  pitchSemitones: 0,
  tempoPercent: 100,
  linked: false,
  reverbAmount: 0,
  lowpassHz: 20000,
  effectsTarget: DEFAULT_EFFECTS_TARGET,
})

export const INVALID_ADJUSTMENTS_MESSAGE
  = `Adjustments need a whole-number pitch from ${PITCH_SEMITONES_MIN} to ${PITCH_SEMITONES_MAX} semitones, `
    + `a whole-number tempo from ${TEMPO_PERCENT_MIN} to ${TEMPO_PERCENT_MAX} percent, a linked flag, `
    + `a whole-number reverb amount from ${REVERB_AMOUNT_MIN} to ${REVERB_AMOUNT_MAX}, `
    + `a whole-number low-pass cutoff from ${LOWPASS_HZ_MIN} to ${LOWPASS_HZ_MAX} Hz, `
    + `and an Effects Target of ${EFFECTS_TARGETS.join(', ')}.`

/**
 * Turns untrusted input into Adjustments, or throws with `INVALID_ADJUSTMENTS_MESSAGE`.
 *
 * `reverbAmount`, `lowpassHz`, and `effectsTarget` default when absent so
 * every `takes` and `mixes` row written before each of them existed still
 * parses — at the bypassed values for the first two, and at the Backing Track
 * for the target, which is the only side the Effects ever reached before it.
 * That tolerance is the whole migration; no stored row is rewritten.
 */
export function parseAdjustments(input: unknown): Adjustments {
  if (!input || typeof input !== 'object') throw new Error(INVALID_ADJUSTMENTS_MESSAGE)
  const { pitchSemitones, tempoPercent, linked, reverbAmount, lowpassHz, effectsTarget }
    = input as Record<string, unknown>
  const resolvedReverbAmount = reverbAmount === undefined ? DEFAULT_ADJUSTMENTS.reverbAmount : reverbAmount
  const resolvedLowpassHz = lowpassHz === undefined ? DEFAULT_ADJUSTMENTS.lowpassHz : lowpassHz
  const resolvedEffectsTarget = effectsTarget === undefined ? DEFAULT_ADJUSTMENTS.effectsTarget : effectsTarget
  if (
    !isIntegerBetween(pitchSemitones, PITCH_SEMITONES_MIN, PITCH_SEMITONES_MAX)
    || !isIntegerBetween(tempoPercent, TEMPO_PERCENT_MIN, TEMPO_PERCENT_MAX)
    || typeof linked !== 'boolean'
    || !isIntegerBetween(resolvedReverbAmount, REVERB_AMOUNT_MIN, REVERB_AMOUNT_MAX)
    || !isIntegerBetween(resolvedLowpassHz, LOWPASS_HZ_MIN, LOWPASS_HZ_MAX)
    || !EFFECTS_TARGETS.includes(resolvedEffectsTarget as EffectsTarget)
  ) {
    throw new Error(INVALID_ADJUSTMENTS_MESSAGE)
  }
  return {
    pitchSemitones,
    tempoPercent,
    linked,
    reverbAmount: resolvedReverbAmount,
    lowpassHz: resolvedLowpassHz,
    effectsTarget: resolvedEffectsTarget as EffectsTarget,
  }
}

/** Rubber Band's time ratio: output length over input length, so a slower tempo is a ratio above one. */
export function timeRatio(adjustments: Adjustments): number {
  return 100 / adjustments.tempoPercent
}

/**
 * Rubber Band's pitch scale, a frequency multiplier. Independent Adjustments
 * use the equal-tempered semitone; linked ones follow the tempo exactly, the
 * way a record sped up rises in pitch.
 */
export function pitchScale(adjustments: Adjustments): number {
  if (adjustments.linked) return adjustments.tempoPercent / 100
  return 2 ** (adjustments.pitchSemitones / 12)
}

/** The pitch shift actually heard, in semitones; fractional when linked to tempo. */
export function effectivePitchSemitones(adjustments: Adjustments): number {
  if (!adjustments.linked) return adjustments.pitchSemitones
  return 12 * Math.log2(adjustments.tempoPercent / 100)
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
