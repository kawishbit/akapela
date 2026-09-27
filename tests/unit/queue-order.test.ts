import { describe, expect, test } from 'vitest'
import { entryReadiness, moveItem, upNextLabel } from '../../app/utils/queue'

describe('moveItem', () => {
  test('moves an item to a new index, leaving the original untouched', () => {
    const list = ['A', 'B', 'C', 'D']

    expect(moveItem(list, 0, 3)).toEqual(['B', 'C', 'D', 'A'])
    expect(moveItem(list, 3, 0)).toEqual(['D', 'A', 'B', 'C'])
    expect(moveItem(list, 1, 2)).toEqual(['A', 'C', 'B', 'D'])
    expect(list).toEqual(['A', 'B', 'C', 'D'])
  })

  test('clamps an index past either end, the way the server does', () => {
    expect(moveItem(['A', 'B', 'C'], 0, 9)).toEqual(['B', 'C', 'A'])
    expect(moveItem(['A', 'B', 'C'], 2, -1)).toEqual(['C', 'A', 'B'])
  })

  test('returns the same order for a move to where it already is, or of nothing', () => {
    expect(moveItem(['A', 'B'], 1, 1)).toEqual(['A', 'B'])
    expect(moveItem(['A', 'B'], 5, 0)).toEqual(['A', 'B'])
  })
})

describe('upNextLabel', () => {
  test('names the singer and the Track', () => {
    expect(upNextLabel({ singerName: 'Sara', track: { title: 'Creep' } })).toBe('Sara — Creep')
  })

  test('names just the Track when nobody gave a name', () => {
    expect(upNextLabel({ singerName: null, track: { title: 'Creep' } })).toBe('Creep')
  })
})

describe('entryReadiness', () => {
  const entry = (separationState: 'none' | 'separating' | 'ready' | 'failed') => ({ track: { separationState } })

  test('goes straight to Sing for a Track that was never separated or has finished', () => {
    expect(entryReadiness(entry('none'))).toBe('ready')
    expect(entryReadiness(entry('ready'))).toBe('ready')
  })

  test('asks first while a Separation runs, and after one failed', () => {
    expect(entryReadiness(entry('separating'))).toBe('separating')
    expect(entryReadiness(entry('failed'))).toBe('failed')
  })
})
