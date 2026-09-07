import { parseAdjustments, type Adjustments } from './adjustments'
import { parseBackingSource, type BackingSource } from './backing-source'

/**
 * Take: one recorded attempt at singing a Track. This module knows the shape
 * of the metadata that comes with an uploaded Take; writing the file and the
 * row belongs to `server/lib/takes`.
 */
export interface TakeUploadMeta {
  /** Song position, in milliseconds, the Backing Track was at when the Take began. */
  startPositionMs: number
  durationMs: number
  adjustments: Adjustments
  /** The Backing Source in force while singing, fixed on the Take forever (ADR 0003 amendment). */
  backingSource: BackingSource
}

export const INVALID_TAKE_META_MESSAGE
  = 'A Take needs a whole-number start position and duration in milliseconds, its Adjustments, and a Backing Source.'

/** Turns the `meta` field of a Take upload into `TakeUploadMeta`, or throws with `INVALID_TAKE_META_MESSAGE`. */
export function parseTakeUploadMeta(input: unknown): TakeUploadMeta {
  if (!input || typeof input !== 'object') throw new Error(INVALID_TAKE_META_MESSAGE)
  const { startPositionMs, durationMs, adjustments, backingSource } = input as Record<string, unknown>
  if (!isIntegerBetween(startPositionMs, 0, Infinity) || !isIntegerBetween(durationMs, 1, Infinity)) {
    throw new Error(INVALID_TAKE_META_MESSAGE)
  }
  try {
    return {
      startPositionMs,
      durationMs,
      adjustments: parseAdjustments(adjustments),
      backingSource: parseBackingSource(backingSource),
    }
  }
  catch {
    throw new Error(INVALID_TAKE_META_MESSAGE)
  }
}

/**
 * What the Review screen (ticket 08) saves on a Take: the latency nudge, the
 * gain pair, and Adjustments. Tempo travels inside `adjustments` but a caller
 * must reject a value that differs from the Take's own — it is locked (ADR 0003).
 */
export interface TakeReviewUpdate {
  latencyNudgeMs: number
  vocalGain: number
  backingGain: number
  adjustments: Adjustments
}

export const LATENCY_NUDGE_MS_MIN = -500
export const LATENCY_NUDGE_MS_MAX = 500
export const GAIN_MIN = 0
export const GAIN_MAX = 2

export const INVALID_TAKE_REVIEW_MESSAGE
  = `A Take's review settings need a whole-number latency nudge from ${LATENCY_NUDGE_MS_MIN} to ${LATENCY_NUDGE_MS_MAX} `
    + `milliseconds, vocal and backing gain from ${GAIN_MIN} to ${GAIN_MAX}, and Adjustments.`

export const TAKE_TEMPO_LOCKED_MESSAGE
  = 'Tempo is locked to what this Take was sung to and cannot be changed on the Review screen.'

/** Turns a Review screen save request into `TakeReviewUpdate`, or throws with `INVALID_TAKE_REVIEW_MESSAGE`. */
export function parseTakeReviewUpdate(input: unknown): TakeReviewUpdate {
  if (!input || typeof input !== 'object') throw new Error(INVALID_TAKE_REVIEW_MESSAGE)
  const { latencyNudgeMs, vocalGain, backingGain, adjustments } = input as Record<string, unknown>
  if (
    !isIntegerBetween(latencyNudgeMs, LATENCY_NUDGE_MS_MIN, LATENCY_NUDGE_MS_MAX)
    || !isNumberBetween(vocalGain, GAIN_MIN, GAIN_MAX)
    || !isNumberBetween(backingGain, GAIN_MIN, GAIN_MAX)
  ) {
    throw new Error(INVALID_TAKE_REVIEW_MESSAGE)
  }
  try {
    return { latencyNudgeMs, vocalGain, backingGain, adjustments: parseAdjustments(adjustments) }
  }
  catch {
    throw new Error(INVALID_TAKE_REVIEW_MESSAGE)
  }
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isNumberBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
