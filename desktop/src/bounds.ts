/**
 * Where the window opens.
 *
 * Plain functions with no Electron import, so the awkward case — a window last
 * closed on a second monitor that is no longer plugged in — is covered by the
 * root vitest suite rather than by unplugging a monitor.
 */

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Just the part of a display this needs: its work area, in screen coordinates. */
export interface DisplayArea {
  workArea: Bounds
}

export const DEFAULT_WINDOW_SIZE = { width: 1180, height: 820 }
export const MIN_WINDOW_SIZE = { width: 720, height: 560 }

/** How much of the window has to be on a display for it to count as reachable. */
const VISIBLE_MARGIN = 80

function overlaps(bounds: Bounds, area: Bounds): boolean {
  const left = Math.max(bounds.x, area.x)
  const right = Math.min(bounds.x + bounds.width, area.x + area.width)
  const top = Math.max(bounds.y, area.y)
  const bottom = Math.min(bounds.y + bounds.height, area.y + area.height)
  return right - left >= VISIBLE_MARGIN && bottom - top >= VISIBLE_MARGIN
}

/** Centres `size` in `area`, clamped so it never starts off the top-left edge. */
function centred(area: Bounds, size: { width: number, height: number }): Bounds {
  const width = Math.min(size.width, area.width)
  const height = Math.min(size.height, area.height)
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  }
}

/**
 * The bounds to open on: what was saved if enough of it lands on a display
 * that is currently attached, and a centred default window otherwise.
 *
 * `displays[0]` is the primary one — where a window with nowhere else to go
 * is put back.
 */
export function restoreBounds(saved: Partial<Bounds> | undefined, displays: DisplayArea[]): Bounds {
  const primary = displays[0]?.workArea ?? { x: 0, y: 0, ...DEFAULT_WINDOW_SIZE }

  if (
    !saved
    || typeof saved.x !== 'number' || typeof saved.y !== 'number'
    || typeof saved.width !== 'number' || typeof saved.height !== 'number'
    || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)
    || saved.width < MIN_WINDOW_SIZE.width || saved.height < MIN_WINDOW_SIZE.height
  ) {
    return centred(primary, DEFAULT_WINDOW_SIZE)
  }

  const bounds = saved as Bounds
  if (displays.some(display => overlaps(bounds, display.workArea))) return bounds
  // Saved on a monitor that has since been unplugged: keep the size the singer
  // chose, put it back somewhere they can actually see it.
  return centred(primary, { width: bounds.width, height: bounds.height })
}
