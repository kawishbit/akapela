import { describe, expect, test } from 'vitest'
import { completeness, formatReport } from '../../scripts/i18n-completeness.ts'

const en = { a: { b: 'B', c: 'C' }, d: 'D' }

describe('completeness', () => {
  test('a Language with every key is complete, with nothing stale', () => {
    expect(completeness(en, { a: { b: 'b', c: 'c' }, d: 'd' })).toEqual({ total: 3, translated: 3, missing: [], stale: [] })
  })

  test('lists the keys still to translate, and the ones en.json no longer has', () => {
    expect(completeness(en, { a: { b: 'b', gone: 'x' } })).toEqual({
      total: 3,
      translated: 1,
      missing: ['a.c', 'd'],
      stale: ['a.gone'],
    })
  })

  test('a string where English has a group, or the other way round, is both missing and stale', () => {
    expect(completeness(en, { a: 'flat', d: { deep: 'x' } })).toEqual({
      total: 3,
      translated: 0,
      missing: ['a.b', 'a.c', 'd'],
      stale: ['a', 'd.deep'],
    })
  })
})

describe('formatReport', () => {
  test('says the percentage and lists what is missing and stale', () => {
    const report = formatReport('id', { total: 4, translated: 3, missing: ['x.y'], stale: ['z'] })
    expect(report).toContain('id: 75% (3 of 4)')
    expect(report).toContain('missing: x.y')
    expect(report).toContain('stale: z')
  })
})
