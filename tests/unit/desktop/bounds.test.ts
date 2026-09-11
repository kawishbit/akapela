import { describe, expect, it } from 'vitest'
import { DEFAULT_WINDOW_SIZE, MIN_WINDOW_SIZE, restoreBounds } from '../../../desktop/src/bounds'

const laptop = { workArea: { x: 0, y: 0, width: 1512, height: 900 } }
/** A second monitor to the left, the arrangement that produces negative coordinates. */
const secondMonitor = { workArea: { x: -1920, y: -200, width: 1920, height: 1080 } }

describe('restoreBounds', () => {
  it('centres a default window on a first run', () => {
    const bounds = restoreBounds(undefined, [laptop])

    expect(bounds.width).toBe(DEFAULT_WINDOW_SIZE.width)
    expect(bounds.height).toBe(DEFAULT_WINDOW_SIZE.height)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
  })

  it('keeps bounds that still land on a display', () => {
    const saved = { x: 100, y: 80, width: 1200, height: 800 }

    expect(restoreBounds(saved, [laptop])).toEqual(saved)
  })

  it('keeps bounds on a second monitor while it is still plugged in', () => {
    const saved = { x: -1800, y: -100, width: 1200, height: 800 }

    expect(restoreBounds(saved, [laptop, secondMonitor])).toEqual(saved)
  })

  it('brings a window back when the monitor it was on is gone', () => {
    const saved = { x: -1800, y: -100, width: 1200, height: 800 }

    const bounds = restoreBounds(saved, [laptop])

    // The size the singer chose survives; the position does not, because that
    // position is nowhere they can see.
    expect(bounds.width).toBe(1200)
    expect(bounds.height).toBe(800)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
  })

  it('brings back a window that is only just off the edge', () => {
    const saved = { x: 1500, y: 880, width: 1200, height: 800 }

    // 12x20 of it is technically on screen, which is not a window anyone can grab.
    expect(restoreBounds(saved, [laptop]).x).toBeLessThan(1500)
  })

  it('shrinks a window larger than the display it is put back on', () => {
    const bounds = restoreBounds({ x: -9000, y: -9000, width: 4000, height: 3000 }, [laptop])

    expect(bounds.width).toBeLessThanOrEqual(laptop.workArea.width)
    expect(bounds.height).toBeLessThanOrEqual(laptop.workArea.height)
  })

  it.each([
    ['a missing field', { x: 10, y: 10, width: 1000 }],
    ['a size below the minimum', { x: 10, y: 10, width: 200, height: 100 }],
    ['NaN coordinates', { x: Number.NaN, y: 0, width: 1000, height: 700 }],
    ['nothing at all', undefined],
  ])('falls back to a default window for %s', (_label, saved) => {
    const bounds = restoreBounds(saved, [laptop])

    expect(bounds.width).toBeGreaterThanOrEqual(MIN_WINDOW_SIZE.width)
    expect(bounds.height).toBeGreaterThanOrEqual(MIN_WINDOW_SIZE.height)
  })

  it('still produces a window when there are no displays to ask about', () => {
    expect(restoreBounds(undefined, []).width).toBe(DEFAULT_WINDOW_SIZE.width)
  })
})
