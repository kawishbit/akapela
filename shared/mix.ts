import { parseAdjustments, type Adjustments } from './adjustments'
import { GAIN_MAX, GAIN_MIN, LATENCY_NUDGE_MS_MAX, LATENCY_NUDGE_MS_MIN } from './take'

/**
 * Mix: the rendered file combining a Take's vocal with its Backing Track.
 * This module knows the shape of a render request; producing the files and
 * the row belongs to `server/lib/mixes`, and doing the rendering to
 * `worker/akapela_worker/jobs/render.py`.
 */
export interface MixRequest {
  /** Pitch and linked may differ from the Take's own for this render; tempo may not (ADR 0003). */
  adjustments: Adjustments
  latencyNudgeMs: number
  vocalGain: number
  backingGain: number
  /** Whether to also export a WAV alongside the MP3, which is always produced. */
  wav: boolean
}

/**
 * The render parameters a Take, a Review screen's live state, and a Mix row
 * all happen to carry under the same field names — enough to build a
 * `MixRequest` from any of them the same way, so the three screens that can
 * trigger a render (a Take's quick action, the Review screen, a retry) don't
 * each assemble the request body by hand.
 */
export interface MixRequestSource {
  pitchSemitones: number
  tempoPercent: number
  linked: boolean
  reverbAmount: number
  lowpassHz: number
  latencyNudgeMs: number
  vocalGain: number
  backingGain: number
}

export function toMixRequest(source: MixRequestSource, wav: boolean): MixRequest {
  return {
    adjustments: {
      pitchSemitones: source.pitchSemitones,
      tempoPercent: source.tempoPercent,
      linked: source.linked,
      reverbAmount: source.reverbAmount,
      lowpassHz: source.lowpassHz,
    },
    latencyNudgeMs: source.latencyNudgeMs,
    vocalGain: source.vocalGain,
    backingGain: source.backingGain,
    wav,
  }
}

export const INVALID_MIX_REQUEST_MESSAGE
  = `A Mix request needs Adjustments, a whole-number latency nudge from ${LATENCY_NUDGE_MS_MIN} to ${LATENCY_NUDGE_MS_MAX} `
    + `milliseconds, vocal and backing gain from ${GAIN_MIN} to ${GAIN_MAX}, and whether to also render a WAV.`

export const MIX_TEMPO_LOCKED_MESSAGE
  = 'A Mix is rendered at the tempo its Take was sung to and cannot request a different one.'

/** Turns a render request into `MixRequest`, or throws with `INVALID_MIX_REQUEST_MESSAGE`. */
export function parseMixRequest(input: unknown): MixRequest {
  if (!input || typeof input !== 'object') throw new Error(INVALID_MIX_REQUEST_MESSAGE)
  const { latencyNudgeMs, vocalGain, backingGain, adjustments, wav } = input as Record<string, unknown>
  if (
    !isIntegerBetween(latencyNudgeMs, LATENCY_NUDGE_MS_MIN, LATENCY_NUDGE_MS_MAX)
    || !isNumberBetween(vocalGain, GAIN_MIN, GAIN_MAX)
    || !isNumberBetween(backingGain, GAIN_MIN, GAIN_MAX)
    || typeof wav !== 'boolean'
  ) {
    throw new Error(INVALID_MIX_REQUEST_MESSAGE)
  }
  try {
    return { latencyNudgeMs, vocalGain, backingGain, wav, adjustments: parseAdjustments(adjustments) }
  }
  catch {
    throw new Error(INVALID_MIX_REQUEST_MESSAGE)
  }
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isNumberBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
