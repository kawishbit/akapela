import { describe, expect, test } from 'vitest'
import { pageLinks, paginate, parseLibraryView, parsePage } from '../../app/utils/library-view'

describe('parseLibraryView', () => {
  test('reads the list back, and anything else as the grid', () => {
    expect(parseLibraryView('list')).toBe('list')
    expect(parseLibraryView('grid')).toBe('grid')
    expect(parseLibraryView(undefined)).toBe('grid')
    expect(parseLibraryView('table')).toBe('grid')
  })
})

describe('parsePage', () => {
  test('reads a whole number from the query', () => {
    expect(parsePage('3')).toBe(3)
    expect(parsePage(['2', '5'])).toBe(2)
  })

  test('falls back to the first page for anything else', () => {
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-2')).toBe(1)
    expect(parsePage('1.5')).toBe(1)
    expect(parsePage('two')).toBe(1)
    expect(parsePage(null)).toBe(1)
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1)

  test('slices the page asked for', () => {
    expect(paginate(items, 2, 10)).toEqual({
      items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      page: 2,
      pageCount: 3,
      first: 11,
      last: 20,
      total: 25,
    })
  })

  test('the last page holds what is left', () => {
    const page = paginate(items, 3, 10)
    expect(page.items).toEqual([21, 22, 23, 24, 25])
    expect([page.first, page.last]).toEqual([21, 25])
  })

  test('a page past the end shows the last one', () => {
    expect(paginate(items, 9, 10).page).toBe(3)
  })

  test('a page before the start shows the first', () => {
    expect(paginate(items, 0, 10).page).toBe(1)
  })

  test('an empty list is one empty page', () => {
    expect(paginate([], 4, 10)).toEqual({ items: [], page: 1, pageCount: 1, first: 0, last: 0, total: 0 })
  })
})

describe('pageLinks', () => {
  test('lists every page when there are few', () => {
    expect(pageLinks(1, 1)).toEqual([1])
    expect(pageLinks(2, 5)).toEqual([1, 2, 3, 4, 5])
  })

  test('leaves out runs in the middle', () => {
    expect(pageLinks(1, 10)).toEqual([1, 2, 'gap', 10])
    expect(pageLinks(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
    expect(pageLinks(10, 10)).toEqual([1, 'gap', 9, 10])
  })

  test('shows a single left-out page rather than a gap', () => {
    expect(pageLinks(4, 10)).toEqual([1, 2, 3, 4, 5, 'gap', 10])
    expect(pageLinks(7, 10)).toEqual([1, 'gap', 6, 7, 8, 9, 10])
  })
})
