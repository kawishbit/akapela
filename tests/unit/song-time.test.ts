import { describe, expect, test } from 'vitest'
import { songTimeAfter, takeElapsedAt, takeSongPosition } from '../../app/audio/song-time'

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

describe('takeSongPosition', () => {
  test('the top of a Take is the song position it was started from', () => {
    expect(takeSongPosition(90_000, 0)).toBe(90_000)
  })

  test('a position in the clip is that far past where the Take started', () => {
    expect(takeSongPosition(90_000, 12_500)).toBe(102_500)
  })

  test('a Take sung from the top of the song puts both clocks together', () => {
    expect(takeSongPosition(0, 12_500)).toBe(12_500)
  })
})

describe('takeElapsedAt', () => {
  test('a song position inside the Take is how far into the clip it is', () => {
    expect(takeElapsedAt(90_000, 102_500, 45_000)).toBe(12_500)
  })

  test('round trips with takeSongPosition', () => {
    expect(takeElapsedAt(90_000, takeSongPosition(90_000, 12_500), 45_000)).toBe(12_500)
  })

  test('a song position before the Take clamps to the top of the clip', () => {
    expect(takeElapsedAt(90_000, 30_000, 45_000)).toBe(0)
  })

  test('a song position past the Take clamps to the end of the clip', () => {
    expect(takeElapsedAt(90_000, 200_000, 45_000)).toBe(45_000)
  })

  test('the end of the clip is itself in range', () => {
    expect(takeElapsedAt(90_000, 135_000, 45_000)).toBe(45_000)
  })
})
