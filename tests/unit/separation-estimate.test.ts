import { describe, expect, test } from 'vitest'
import { FALLBACK_SEPARATION_MS_PER_AUDIO_MS, separationMsPerAudioMs } from '../../server/lib/playlist-imports'

describe('separationMsPerAudioMs', () => {
  test('averages each Separation\'s time per millisecond of its Track', () => {
    expect(separationMsPerAudioMs([
      { elapsedMs: 60_000, durationMs: 240_000 },
      { elapsedMs: 90_000, durationMs: 180_000 },
    ])).toBeCloseTo((0.25 + 0.5) / 2)
  })

  test('falls back to about 70 s per 4 minutes of audio with nothing to go on', () => {
    expect(separationMsPerAudioMs([])).toBe(FALLBACK_SEPARATION_MS_PER_AUDIO_MS)
    expect(FALLBACK_SEPARATION_MS_PER_AUDIO_MS * 240_000).toBeCloseTo(70_000)
  })

  test('leaves out a Separation that could not have been timed', () => {
    expect(separationMsPerAudioMs([
      { elapsedMs: 0, durationMs: 240_000 },
      { elapsedMs: 60_000, durationMs: 0 },
      { elapsedMs: 60_000, durationMs: 120_000 },
    ])).toBeCloseTo(0.5)
  })
})
