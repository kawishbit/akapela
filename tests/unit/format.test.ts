import { describe, expect, test } from 'vitest'
import { errorSummary, formatDuration } from '../../app/utils/format'

describe('formatDuration', () => {
  test('shows minutes and zero-padded seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(5_000)).toBe('0:05')
    expect(formatDuration(213_400)).toBe('3:33')
  })

  test('adds hours when a Track is an hour or longer', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })

  test('is a placeholder while the duration is unknown', () => {
    expect(formatDuration(null)).toBe('--:--')
    expect(formatDuration(undefined)).toBe('--:--')
  })
})

describe('errorSummary', () => {
  test('keeps the first line and drops the Python exception type', () => {
    const error = 'AudioError: ffmpeg could not decode original.mp3: Invalid data found\nTraceback (most recent call last):\n  File ...'
    expect(errorSummary(error)).toBe('ffmpeg could not decode original.mp3: Invalid data found')
  })

  test('falls back to a generic message when there is no error text', () => {
    expect(errorSummary(null)).toBe('Import failed')
    expect(errorSummary('')).toBe('Import failed')
  })
})
