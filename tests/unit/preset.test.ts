import { describe, expect, test } from 'vitest'
import { presetAdjustments, type Preset } from '../../shared/preset'

const NIGHTCORE: Pick<Preset, 'pitchSemitones' | 'tempoPercent' | 'linked' | 'reverbAmount' | 'lowpassHz'> = {
  pitchSemitones: 0,
  tempoPercent: 130,
  linked: true,
  reverbAmount: 20,
  lowpassHz: 20000,
}

describe('applying a Preset to Adjustments', () => {
  test('lifts out the five Adjustments fields the Preset carries', () => {
    expect(presetAdjustments(NIGHTCORE)).toEqual({
      pitchSemitones: 0,
      tempoPercent: 130,
      linked: true,
      reverbAmount: 20,
      lowpassHz: 20000,
    })
  })

  test('drops anything Track-specific a full Preset row also carries', () => {
    const row: Preset = {
      id: 'preset-1',
      name: 'My Sound',
      ...NIGHTCORE,
      builtIn: false,
      createdAt: 1000,
      updatedAt: 1000,
    }
    const adjustments = presetAdjustments(row)
    expect(adjustments).not.toHaveProperty('id')
    expect(adjustments).not.toHaveProperty('name')
    expect(adjustments).not.toHaveProperty('builtIn')
  })
})
