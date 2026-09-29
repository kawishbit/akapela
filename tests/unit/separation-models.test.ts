import { describe, expect, test } from 'vitest'
import { otherSeparationModels, separationModelAvailability, separationModelDescription } from '../../app/utils/separation'
import { SEPARATION_MODEL_NAMES } from '../../server/lib/separators/models'
import { englishTranslate } from './i18n'

const t = englishTranslate()

const CATALOG = SEPARATION_MODEL_NAMES.map(name => ({ name }))

describe('otherSeparationModels', () => {
  test('offers every model but the one that made the current Stems', () => {
    expect(otherSeparationModels(CATALOG, 'Inst_HQ_3').map(m => m.name)).toEqual(['Inst_Main', 'Inst_HQ_4', 'Kim_Vocal_2'])
  })

  test('offers every model when there are no Stems', () => {
    expect(otherSeparationModels(CATALOG, null)).toEqual(CATALOG)
  })
})

describe('separationModelAvailability', () => {
  test('says a downloaded model is here', () => {
    expect(separationModelAvailability({ downloaded: true, downloadBytes: 52_786_726 }, t)).toBe('Downloaded')
  })

  test('says a model not yet here downloads first, and how much', () => {
    expect(separationModelAvailability({ downloaded: false, downloadBytes: 66_759_214 }, t)).toBe('Not downloaded · 64 MB')
  })
})

describe('separationModelDescription', () => {
  test.each(SEPARATION_MODEL_NAMES)('%s has words in en.json', (name) => {
    expect(separationModelDescription(name, t)).not.toContain('separationModels.')
  })
})
