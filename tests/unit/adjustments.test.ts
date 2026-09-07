import { describe, expect, test } from 'vitest'
import {
  DEFAULT_ADJUSTMENTS,
  INVALID_ADJUSTMENTS_MESSAGE,
  effectivePitchSemitones,
  parseAdjustments,
  pitchScale,
  timeRatio,
  type Adjustments,
} from '../../shared/adjustments'

/** Neither function cares about the Effects; this fills them in so callers below can stay focused on pitch and tempo. */
function adjustments(overrides: Partial<Adjustments>): Adjustments {
  return { ...DEFAULT_ADJUSTMENTS, ...overrides }
}

describe('what the engine applies', () => {
  test('pitch in semitones becomes a frequency scale on the equal-tempered scale', () => {
    expect(pitchScale(adjustments({ pitchSemitones: 0, tempoPercent: 100, linked: false }))).toBe(1)
    expect(pitchScale(adjustments({ pitchSemitones: 12, tempoPercent: 100, linked: false }))).toBe(2)
    expect(pitchScale(adjustments({ pitchSemitones: -12, tempoPercent: 100, linked: false }))).toBe(0.5)
    expect(pitchScale(adjustments({ pitchSemitones: 7, tempoPercent: 100, linked: false }))).toBeCloseTo(1.4983, 4)
  })

  test('tempo in percent becomes the stretch ratio of output length to input length', () => {
    expect(timeRatio(adjustments({ pitchSemitones: 0, tempoPercent: 100, linked: false }))).toBe(1)
    expect(timeRatio(adjustments({ pitchSemitones: 0, tempoPercent: 50, linked: false }))).toBe(2)
    expect(timeRatio(adjustments({ pitchSemitones: 0, tempoPercent: 150, linked: false }))).toBeCloseTo(2 / 3, 10)
  })

  test('tempo leaves pitch alone unless linked', () => {
    expect(pitchScale(adjustments({ pitchSemitones: 0, tempoPercent: 50, linked: false }))).toBe(1)
    expect(effectivePitchSemitones(adjustments({ pitchSemitones: 3, tempoPercent: 50, linked: false }))).toBe(3)
  })

  test('when linked, pitch follows tempo like a turntable and the semitone setting is ignored', () => {
    expect(pitchScale(adjustments({ pitchSemitones: 5, tempoPercent: 50, linked: true }))).toBe(0.5)
    expect(pitchScale(adjustments({ pitchSemitones: 5, tempoPercent: 150, linked: true }))).toBe(1.5)
    expect(effectivePitchSemitones(adjustments({ pitchSemitones: 5, tempoPercent: 50, linked: true }))).toBe(-12)
    expect(effectivePitchSemitones(adjustments({ pitchSemitones: 5, tempoPercent: 200, linked: true }))).toBe(12)
    expect(effectivePitchSemitones(adjustments({ pitchSemitones: 5, tempoPercent: 112, linked: true }))).toBeCloseTo(1.96, 2)
  })
})

describe('parseAdjustments', () => {
  test('accepts pitch in semitones, tempo in percent, the link flag, reverb amount, and low-pass cutoff', () => {
    expect(parseAdjustments({ pitchSemitones: -3, tempoPercent: 85, linked: false, reverbAmount: 40, lowpassHz: 8000 })).toEqual({
      pitchSemitones: -3,
      tempoPercent: 85,
      linked: false,
      reverbAmount: 40,
      lowpassHz: 8000,
    })
  })

  test('accepts the extremes of every range', () => {
    expect(parseAdjustments({ pitchSemitones: -12, tempoPercent: 50, linked: true, reverbAmount: 0, lowpassHz: 200 })).toEqual({
      pitchSemitones: -12,
      tempoPercent: 50,
      linked: true,
      reverbAmount: 0,
      lowpassHz: 200,
    })
    expect(parseAdjustments({ pitchSemitones: 12, tempoPercent: 150, linked: false, reverbAmount: 100, lowpassHz: 20000 })).toEqual({
      pitchSemitones: 12,
      tempoPercent: 150,
      linked: false,
      reverbAmount: 100,
      lowpassHz: 20000,
    })
  })

  test('drops anything beyond the five parameters', () => {
    const parsed = parseAdjustments({ pitchSemitones: 0, tempoPercent: 100, linked: false, reverbAmount: 0, lowpassHz: 20000, resonance: 0.5 })
    expect(parsed).toEqual(DEFAULT_ADJUSTMENTS)
    expect(parsed).not.toHaveProperty('resonance')
  })

  test('defaults reverbAmount and lowpassHz to bypassed when a phase-one three-field row is parsed', () => {
    const parsed = parseAdjustments({ pitchSemitones: -2, tempoPercent: 90, linked: false })
    expect(parsed).toEqual({ pitchSemitones: -2, tempoPercent: 90, linked: false, reverbAmount: 0, lowpassHz: 20000 })
  })

  test.each([
    ['pitch above twelve', { pitchSemitones: 13, tempoPercent: 100, linked: false }],
    ['pitch below minus twelve', { pitchSemitones: -13, tempoPercent: 100, linked: false }],
    ['fractional pitch', { pitchSemitones: 1.5, tempoPercent: 100, linked: false }],
    ['tempo below fifty', { pitchSemitones: 0, tempoPercent: 49, linked: false }],
    ['tempo above one hundred fifty', { pitchSemitones: 0, tempoPercent: 151, linked: false }],
    ['fractional tempo', { pitchSemitones: 0, tempoPercent: 99.5, linked: false }],
    ['pitch as a string', { pitchSemitones: '2', tempoPercent: 100, linked: false }],
    ['linked as a string', { pitchSemitones: 0, tempoPercent: 100, linked: 'yes' }],
    ['missing tempo', { pitchSemitones: 0, linked: false }],
    ['reverb below zero', { pitchSemitones: 0, tempoPercent: 100, linked: false, reverbAmount: -1 }],
    ['reverb above one hundred', { pitchSemitones: 0, tempoPercent: 100, linked: false, reverbAmount: 101 }],
    ['fractional reverb', { pitchSemitones: 0, tempoPercent: 100, linked: false, reverbAmount: 12.5 }],
    ['reverb as a string', { pitchSemitones: 0, tempoPercent: 100, linked: false, reverbAmount: '0' }],
    ['low-pass below two hundred', { pitchSemitones: 0, tempoPercent: 100, linked: false, lowpassHz: 199 }],
    ['low-pass above twenty thousand', { pitchSemitones: 0, tempoPercent: 100, linked: false, lowpassHz: 20001 }],
    ['fractional low-pass', { pitchSemitones: 0, tempoPercent: 100, linked: false, lowpassHz: 500.5 }],
    ['low-pass as a string', { pitchSemitones: 0, tempoPercent: 100, linked: false, lowpassHz: '20000' }],
    ['not an object', 'fast'],
    ['null', null],
  ])('rejects %s', (_label, input) => {
    expect(() => parseAdjustments(input)).toThrow(INVALID_ADJUSTMENTS_MESSAGE)
  })
})
