import { describe, expect, test } from 'vitest'
import {
  BACKING_SOURCES,
  DEFAULT_BACKING_SOURCE,
  INVALID_BACKING_SOURCE_MESSAGE,
  parseBackingSource,
} from '../../shared/backing-source'

describe('parseBackingSource', () => {
  test('accepts each Backing Source a Track can be on', () => {
    for (const source of BACKING_SOURCES) expect(parseBackingSource(source)).toBe(source)
  })

  test('a Track sings over its original audio until something says otherwise', () => {
    expect(DEFAULT_BACKING_SOURCE).toBe('original')
  })

  test('rejects anything else, naming both Backing Sources', () => {
    for (const bad of ['vocals', 'Original', '', ' original', null, undefined, 1, {}]) {
      expect(() => parseBackingSource(bad)).toThrow(INVALID_BACKING_SOURCE_MESSAGE)
    }
    expect(INVALID_BACKING_SOURCE_MESSAGE).toContain('original')
    expect(INVALID_BACKING_SOURCE_MESSAGE).toContain('instrumental')
  })
})
