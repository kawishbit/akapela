import { describe, expect, test } from 'vitest'
import { errorSummary, formatMegabytes, formatDuration, formatGain, formatLatencyNudge, formatLowpassHz, formatLyricsOffset, formatPitch, formatReverbAmount, formatTempo } from '../../app/utils/format'

describe('formatPitch', () => {
  test('shows whole semitones with an explicit sign', () => {
    expect(formatPitch(0)).toBe('0 st')
    expect(formatPitch(2)).toBe('+2 st')
    expect(formatPitch(-12)).toBe('-12 st')
  })

  test('shows one decimal when pitch follows tempo', () => {
    expect(formatPitch(-3.157)).toBe('-3.2 st')
    expect(formatPitch(1.96)).toBe('+2.0 st')
  })
})

describe('formatTempo', () => {
  test('shows a percentage', () => {
    expect(formatTempo(100)).toBe('100%')
    expect(formatTempo(85)).toBe('85%')
  })
})

describe('formatReverbAmount', () => {
  test('shows a percentage', () => {
    expect(formatReverbAmount(0)).toBe('0%')
    expect(formatReverbAmount(42)).toBe('42%')
    expect(formatReverbAmount(100)).toBe('100%')
  })
})

describe('formatLowpassHz', () => {
  test('shows Hz below 1000', () => {
    expect(formatLowpassHz(200)).toBe('200 Hz')
    expect(formatLowpassHz(999)).toBe('999 Hz')
  })

  test('shows kHz at 1000 and above, one decimal unless whole', () => {
    expect(formatLowpassHz(1000)).toBe('1 kHz')
    expect(formatLowpassHz(1500)).toBe('1.5 kHz')
    expect(formatLowpassHz(8000)).toBe('8 kHz')
  })

  test('reads as Off at the bypass value', () => {
    expect(formatLowpassHz(20000)).toBe('Off')
  })
})

describe('formatLyricsOffset', () => {
  test('shows tenths of a second with an explicit sign', () => {
    expect(formatLyricsOffset(0)).toBe('0.0 s')
    expect(formatLyricsOffset(300)).toBe('+0.3 s')
    expect(formatLyricsOffset(-1500)).toBe('-1.5 s')
    expect(formatLyricsOffset(10000)).toBe('+10.0 s')
  })
})

describe('formatLatencyNudge', () => {
  test('shows milliseconds with an explicit sign', () => {
    expect(formatLatencyNudge(0)).toBe('0 ms')
    expect(formatLatencyNudge(80)).toBe('+80 ms')
    expect(formatLatencyNudge(-40)).toBe('-40 ms')
  })
})

describe('formatGain', () => {
  test('shows a linear gain as a percentage of unity', () => {
    expect(formatGain(1)).toBe('100%')
    expect(formatGain(0)).toBe('0%')
    expect(formatGain(1.5)).toBe('150%')
  })
})

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

describe('formatMegabytes', () => {
  test('shows megabytes to one decimal under 10 MB', () => {
    expect(formatMegabytes(0)).toBe('0.0 MB')
    expect(formatMegabytes(5.5 * 1024 * 1024)).toBe('5.5 MB')
  })

  test('rounds to whole megabytes from 10 MB up, matching two Stems at ADR 0005\'s rates', () => {
    expect(formatMegabytes(162 * 1024 * 1024)).toBe('162 MB')
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

  test('the fallback names the job the singer was watching', () => {
    expect(errorSummary(null, 'Separation failed')).toBe('Separation failed')
    expect(errorSummary('SeparationError:', 'Separation failed')).toBe('Separation failed')
    expect(errorSummary('SeparationError: no network', 'Separation failed')).toBe('no network')
  })
})
