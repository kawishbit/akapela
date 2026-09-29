/** How the Library lays its Tracks out: cover-art cards, or one Track per row. */
export type LibraryView = 'grid' | 'list'

export const LIBRARY_VIEWS: LibraryView[] = ['grid', 'list']

/**
 * Tracks on one page of the Library. 60 fills whole rows at every grid width
 * the page has (2, 3, 4, and 5 columns), so no page ends on a ragged row.
 */
export const LIBRARY_PAGE_SIZE = 60

/** A stored or requested view, or the grid when it is anything else. */
export function parseLibraryView(value: unknown): LibraryView {
  return value === 'list' ? 'list' : 'grid'
}

/** The page asked for in a route's `?page=`, or the first when it is missing or not a whole number above zero. */
export function parsePage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return 1
  const page = Number(raw)
  return page >= 1 ? page : 1
}

export interface Page<T> {
  items: T[]
  /** The page shown, which is the one asked for pulled back into range. */
  page: number
  pageCount: number
  /** The 1-based position of the page's first and last item in the whole list, both 0 when it is empty. */
  first: number
  last: number
  total: number
}

/**
 * One page of `items`. A page past the end — after a delete or a narrower
 * search — shows the last one rather than nothing, and an empty list is a
 * single empty page.
 */
export function paginate<T>(items: readonly T[], page: number, size: number = LIBRARY_PAGE_SIZE): Page<T> {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const shown = Math.min(Math.max(1, Math.floor(page)), pageCount)
  const start = (shown - 1) * size
  const slice = items.slice(start, start + size)
  return {
    items: slice,
    page: shown,
    pageCount,
    first: slice.length ? start + 1 : 0,
    last: start + slice.length,
    total,
  }
}

/**
 * The page numbers to offer: the first, the last, and the current one with
 * its neighbours, with `'gap'` where a run is left out. A gap never stands in
 * for a single page — that page is shown instead, since it takes the same room.
 */
export function pageLinks(page: number, pageCount: number): (number | 'gap')[] {
  const wanted = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter(n => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b)
  const links: (number | 'gap')[] = []
  let previous = 0
  for (const n of wanted) {
    if (n - previous === 2) links.push(n - 1)
    else if (n - previous > 2) links.push('gap')
    links.push(n)
    previous = n
  }
  return links
}
