import { describe, expect, test } from 'vitest'
import {
  DEFAULT_ADJUSTMENTS,
  INVALID_ADJUSTMENTS_MESSAGE,
  effectivePitchSemitones,
  parseAdjustments,
  pitchScale,
  timeRatio,
} from '../../shared/adjustments'

describe('what the engine applies', () => {
  test('pitch in semitones becomes a frequency scale on the equal-tempered scale', () => {
    expect(pitchScale({ pitchSemitones: 0, tempoPercent: 100, linked: false })).toBe(1)
    expect(pitchScale({ pitchSemitones: 12, tempoPercent: 100, linked: false })).toBe(2)
    expect(pitchScale({ pitchSemitones: -12, tempoPercent: 100, linked: false })).toBe(0.5)
    expect(pitchScale({ pitchSemitones: 7, tempoPercent: 100, linked: false })).toBeCloseTo(1.4983, 4)
  })

  test('tempo in percent becomes the stretch ratio of output length to input length', () => {
    expect(timeRatio({ pitchSemitones: 0, tempoPercent: 100, linked: false })).toBe(1)
    expect(timeRatio({ pitchSemitones: 0, tempoPercent: 50, linked: false })).toBe(2)
    expect(timeRatio({ pitchSemitones: 0, tempoPercent: 150, linked: false })).toBeCloseTo(2 / 3, 10)
  })

  test('tempo leaves pitch alone unless linked', () => {
    expect(pitchScale({ pitchSemitones: 0, tempoPercent: 50, linked: false })).toBe(1)
    expect(effectivePitchSemitones({ pitchSemitones: 3, tempoPercent: 50, linked: false })).toBe(3)
  })

  test('when linked, pitch follows tempo like a turntable and the semitone setting is ignored', () => {
    expect(pitchScale({ pitchSemitones: 5, tempoPercent: 50, linked: true })).toBe(0.5)
    expect(pitchScale({ pitchSemitones: 5, tempoPercent: 150, linked: true })).toBe(1.5)
    expect(effectivePitchSemitones({ pitchSemitones: 5, tempoPercent: 50, linked: true })).toBe(-12)
    expect(effectivePitchSemitones({ pitchSemitones: 5, tempoPercent: 200, linked: true })).toBe(12)
    expect(effectivePitchSemitones({ pitchSemitones: 5, tempoPercent: 112, linked: true })).toBeCloseTo(1.96, 2)
  })
})

describe('parseAdjustments', () => {
  test('accepts pitch in semitones, tempo in percent, and the link flag', () => {
    expect(parseAdjustments({ pitchSemitones: -3, tempoPercent: 85, linked: false })).toEqual({
      pitchSemitones: -3,
      tempoPercent: 85,
      linked: false,
    })
  })

  test('accepts the extremes of both ranges', () => {
    expect(parseAdjustments({ pitchSemitones: -12, tempoPercent: 50, linked: true })).toEqual({
      pitchSemitones: -12,
      tempoPercent: 50,
      linked: true,
    })
    expect(parseAdjustments({ pitchSemitones: 12, tempoPercent: 150, linked: false })).toEqual({
      pitchSemitones: 12,
      tempoPercent: 150,
      linked: false,
    })
  })

  test('drops anything beyond the three parameters', () => {
    const parsed = parseAdjustments({ pitchSemitones: 0, tempoPercent: 100, linked: false, reverb: 0.5 })
    expect(parsed).toEqual(DEFAULT_ADJUSTMENTS)
    expect(parsed).not.toHaveProperty('reverb')
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
    ['not an object', 'fast'],
    ['null', null],
  ])('rejects %s', (_label, input) => {
    expect(() => parseAdjustments(input)).toThrow(INVALID_ADJUSTMENTS_MESSAGE)
  })
})
