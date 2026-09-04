import { parseAdjustments, type Adjustments } from './adjustments'

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
}

export const INVALID_TAKE_META_MESSAGE
  = 'A Take needs a whole-number start position and duration in milliseconds, and its Adjustments.'

/** Turns the `meta` field of a Take upload into `TakeUploadMeta`, or throws with `INVALID_TAKE_META_MESSAGE`. */
export function parseTakeUploadMeta(input: unknown): TakeUploadMeta {
  if (!input || typeof input !== 'object') throw new Error(INVALID_TAKE_META_MESSAGE)
  const { startPositionMs, durationMs, adjustments } = input as Record<string, unknown>
  if (!isNonNegativeInteger(startPositionMs) || !isPositiveInteger(durationMs)) {
    throw new Error(INVALID_TAKE_META_MESSAGE)
  }
  try {
    return { startPositionMs, durationMs, adjustments: parseAdjustments(adjustments) }
  }
  catch {
    throw new Error(INVALID_TAKE_META_MESSAGE)
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}
