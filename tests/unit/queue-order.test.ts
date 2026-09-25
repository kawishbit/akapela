import { describe, expect, test } from 'vitest'
import { moveItem } from '../../app/utils/queue'

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
