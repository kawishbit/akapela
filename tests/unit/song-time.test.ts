import { describe, expect, test } from 'vitest'
import { songTimeAfter } from '../../app/audio/song-time'

describe('songTimeAfter', () => {
  test('at full tempo song time advances with the clock', () => {
    expect(songTimeAfter(10_000, 5_000, 100)).toBe(15_000)
  })

  test('at half tempo a second on the clock is half a second of song', () => {
    expect(songTimeAfter(10_000, 5_000, 50)).toBe(12_500)
  })

  test('at one hundred fifty percent the song runs ahead of the clock', () => {
    expect(songTimeAfter(0, 4_000, 150)).toBe(6_000)
  })

  test('no time elapsed is the same position at any tempo', () => {
    expect(songTimeAfter(42_000, 0, 75)).toBe(42_000)
  })
})
