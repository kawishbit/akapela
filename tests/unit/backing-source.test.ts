import { describe, expect, test } from 'vitest'
import {
  BACKING_SOURCES,
  DEFAULT_BACKING_SOURCE,
  DEFAULT_STEM_LEVELS,
  INVALID_BACKING_SOURCE_MESSAGE,
  INVALID_STEM_LEVELS_MESSAGE,
  INVALID_STEM_MESSAGE,
  parseBackingSource,
  parseStem,
  parseStemLevels,
} from '../../shared/backing-source'

describe('parseBackingSource', () => {
  test('accepts each Backing Source a Track can be on', () => {
    for (const source of BACKING_SOURCES) expect(parseBackingSource(source)).toBe(source)
    expect(BACKING_SOURCES).toEqual(['original', 'stems'])
  })

  test('reads the old `instrumental` as Stems, which is what it always was', () => {
    expect(parseBackingSource('instrumental')).toBe('stems')
  })

  test('a Track sings over its original audio until something says otherwise', () => {
    expect(DEFAULT_BACKING_SOURCE).toBe('original')
  })

  test('rejects anything else, naming both Backing Sources', () => {
    for (const bad of ['vocals', 'Original', 'Stems', '', ' original', null, undefined, 1, {}]) {
      expect(() => parseBackingSource(bad)).toThrow(INVALID_BACKING_SOURCE_MESSAGE)
    }
    expect(INVALID_BACKING_SOURCE_MESSAGE).toContain('original')
    expect(INVALID_BACKING_SOURCE_MESSAGE).toContain('stems')
  })
})

describe('parseStem', () => {
  test('names either Stem, and nothing else', () => {
    expect(parseStem('vocals')).toBe('vocals')
    expect(parseStem('instrumental')).toBe('instrumental')
    for (const bad of ['original', 'stems', 'drums', '', undefined]) {
      expect(() => parseStem(bad)).toThrow(INVALID_STEM_MESSAGE)
    }
  })
})

describe('parseStemLevels', () => {
  test('start with no Guide Vocal and the whole Instrumental', () => {
    expect(DEFAULT_STEM_LEVELS).toEqual({ guideVocal: 0, instrumental: 1 })
  })

  test('accepts each level from silent to as separated, inclusive', () => {
    for (const levels of [
      { guideVocal: 0, instrumental: 0 },
      { guideVocal: 1, instrumental: 1 },
      { guideVocal: 0.3, instrumental: 0.75 },
    ]) {
      expect(parseStemLevels(levels)).toEqual(levels)
    }
  })

  test('keeps only the two levels', () => {
    expect(parseStemLevels({ guideVocal: 0.5, instrumental: 1, drums: 1 })).toEqual({ guideVocal: 0.5, instrumental: 1 })
  })

  test('refuses a level outside 0 to 1, or missing, saying the range', () => {
    for (const bad of [
      { guideVocal: -0.01, instrumental: 1 },
      { guideVocal: 0, instrumental: 1.01 },
      { guideVocal: 0, instrumental: 2 },
      { guideVocal: Number.NaN, instrumental: 1 },
      { guideVocal: '0.5', instrumental: 1 },
      { instrumental: 1 },
      null,
      undefined,
      0.5,
    ]) {
      expect(() => parseStemLevels(bad)).toThrow(INVALID_STEM_LEVELS_MESSAGE)
    }
    expect(INVALID_STEM_LEVELS_MESSAGE).toMatch(/from 0 to 1/)
  })
})
