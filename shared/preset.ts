import {
  LOWPASS_HZ_MAX,
  LOWPASS_HZ_MIN,
  PITCH_SEMITONES_MAX,
  PITCH_SEMITONES_MIN,
  REVERB_AMOUNT_MAX,
  REVERB_AMOUNT_MIN,
  TEMPO_PERCENT_MAX,
  TEMPO_PERCENT_MIN,
  type Adjustments,
} from './adjustments'

/**
 * Preset: a named bundle of Adjustments, one tap to apply. Carries the five
 * Adjustments fields and nothing Track-specific — not Backing Source, not
 * Lyrics Offset, not the gains a Take does not exist yet to have — so
 * applying one to any Track does what its name says. This module knows the
 * shape of a Preset and how to create one; storing and listing them belongs
 * to `server/lib/presets`.
 */
export interface Preset {
  id: string
  name: string
  pitchSemitones: number
  tempoPercent: number
  linked: boolean
  reverbAmount: number
  lowpassHz: number
  /** Ships with the app; undeletable (story 25). */
  builtIn: boolean
  createdAt: number
  updatedAt: number
}

/** The Adjustments a Preset carries, lifted out of its Track-agnostic fields. */
export function presetAdjustments(preset: Pick<Preset, 'pitchSemitones' | 'tempoPercent' | 'linked' | 'reverbAmount' | 'lowpassHz'>): Adjustments {
  return {
    pitchSemitones: preset.pitchSemitones,
    tempoPercent: preset.tempoPercent,
    linked: preset.linked,
    reverbAmount: preset.reverbAmount,
    lowpassHz: preset.lowpassHz,
  }
}

/** What creating a Preset needs: a name and the Adjustments it bundles. */
export interface PresetCreate {
  name: string
  adjustments: Adjustments
}

export const PRESET_NAME_MAX_LENGTH = 60

export const INVALID_PRESET_MESSAGE
  = `A Preset needs a name up to ${PRESET_NAME_MAX_LENGTH} characters, `
    + `a whole-number pitch from ${PITCH_SEMITONES_MIN} to ${PITCH_SEMITONES_MAX} semitones, `
    + `a whole-number tempo from ${TEMPO_PERCENT_MIN} to ${TEMPO_PERCENT_MAX} percent, a linked flag, `
    + `a whole-number reverb amount from ${REVERB_AMOUNT_MIN} to ${REVERB_AMOUNT_MAX}, `
    + `and a whole-number low-pass cutoff from ${LOWPASS_HZ_MIN} to ${LOWPASS_HZ_MAX} Hz.`

export const DUPLICATE_PRESET_NAME_MESSAGE = 'A Preset with this name already exists.'
export const BUILT_IN_PRESET_UNDELETABLE_MESSAGE = 'This Preset ships with the app and cannot be deleted.'

/** Turns a save request into `PresetCreate`, or throws with `INVALID_PRESET_MESSAGE`. */
export function parsePresetCreate(input: unknown): PresetCreate {
  if (!input || typeof input !== 'object') throw new Error(INVALID_PRESET_MESSAGE)
  const { name, adjustments } = input as Record<string, unknown>
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > PRESET_NAME_MAX_LENGTH) {
    throw new Error(INVALID_PRESET_MESSAGE)
  }
  const {
    pitchSemitones,
    tempoPercent,
    linked,
    reverbAmount,
    lowpassHz,
  } = (adjustments ?? {}) as Record<string, unknown>
  if (
    !isIntegerBetween(pitchSemitones, PITCH_SEMITONES_MIN, PITCH_SEMITONES_MAX)
    || !isIntegerBetween(tempoPercent, TEMPO_PERCENT_MIN, TEMPO_PERCENT_MAX)
    || typeof linked !== 'boolean'
    || !isIntegerBetween(reverbAmount, REVERB_AMOUNT_MIN, REVERB_AMOUNT_MAX)
    || !isIntegerBetween(lowpassHz, LOWPASS_HZ_MIN, LOWPASS_HZ_MAX)
  ) {
    throw new Error(INVALID_PRESET_MESSAGE)
  }
  return {
    name: name.trim(),
    adjustments: { pitchSemitones, tempoPercent, linked, reverbAmount, lowpassHz },
  }
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
