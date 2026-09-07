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
}

export const PITCH_SEMITONES_MIN = -12
export const PITCH_SEMITONES_MAX = 12
export const TEMPO_PERCENT_MIN = 50
export const TEMPO_PERCENT_MAX = 150
export const REVERB_AMOUNT_MIN = 0
export const REVERB_AMOUNT_MAX = 100
export const LOWPASS_HZ_MIN = 200
export const LOWPASS_HZ_MAX = 20000

export const DEFAULT_ADJUSTMENTS: Readonly<Adjustments> = Object.freeze({
  pitchSemitones: 0,
  tempoPercent: 100,
  linked: false,
  reverbAmount: 0,
  lowpassHz: 20000,
})

export const INVALID_ADJUSTMENTS_MESSAGE
  = `Adjustments need a whole-number pitch from ${PITCH_SEMITONES_MIN} to ${PITCH_SEMITONES_MAX} semitones, `
    + `a whole-number tempo from ${TEMPO_PERCENT_MIN} to ${TEMPO_PERCENT_MAX} percent, a linked flag, `
    + `a whole-number reverb amount from ${REVERB_AMOUNT_MIN} to ${REVERB_AMOUNT_MAX}, `
    + `and a whole-number low-pass cutoff from ${LOWPASS_HZ_MIN} to ${LOWPASS_HZ_MAX} Hz.`

/**
 * Turns untrusted input into Adjustments, or throws with `INVALID_ADJUSTMENTS_MESSAGE`.
 *
 * `reverbAmount` and `lowpassHz` default when absent so every `takes` and
 * `mixes` row written before this pair existed — a three-field JSON blob —
 * still parses, at their bypassed values. That tolerance is the whole
 * migration; no stored row is rewritten.
 */
export function parseAdjustments(input: unknown): Adjustments {
  if (!input || typeof input !== 'object') throw new Error(INVALID_ADJUSTMENTS_MESSAGE)
  const { pitchSemitones, tempoPercent, linked, reverbAmount, lowpassHz } = input as Record<string, unknown>
  const resolvedReverbAmount = reverbAmount === undefined ? DEFAULT_ADJUSTMENTS.reverbAmount : reverbAmount
  const resolvedLowpassHz = lowpassHz === undefined ? DEFAULT_ADJUSTMENTS.lowpassHz : lowpassHz
  if (
    !isIntegerBetween(pitchSemitones, PITCH_SEMITONES_MIN, PITCH_SEMITONES_MAX)
    || !isIntegerBetween(tempoPercent, TEMPO_PERCENT_MIN, TEMPO_PERCENT_MAX)
    || typeof linked !== 'boolean'
    || !isIntegerBetween(resolvedReverbAmount, REVERB_AMOUNT_MIN, REVERB_AMOUNT_MAX)
    || !isIntegerBetween(resolvedLowpassHz, LOWPASS_HZ_MIN, LOWPASS_HZ_MAX)
  ) {
    throw new Error(INVALID_ADJUSTMENTS_MESSAGE)
  }
  return { pitchSemitones, tempoPercent, linked, reverbAmount: resolvedReverbAmount, lowpassHz: resolvedLowpassHz }
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
