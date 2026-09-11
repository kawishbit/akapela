import { describe, expect, it, vi } from 'vitest'
import {
  choosePort,
  isUsablePort,
  NoFreePortError,
  PORT_RANGE_MAX,
  PORT_RANGE_MIN,
} from '../../../desktop/src/port'

/**
 * `desktop/` is its own package with its own install, but `port.ts` imports
 * nothing from it — which is exactly what lets the port rules be covered here,
 * in the suite that actually runs on every change, rather than by launching a
 * window and squinting at it.
 */

describe('choosePort', () => {
  it('reuses the remembered port when it is still free', async () => {
    const free = vi.fn(async () => true)

    expect(await choosePort(54_321, { free })).toBe(54_321)
    expect(free).toHaveBeenCalledExactlyOnceWith(54_321)
  })

  it('picks a new one when the remembered port is taken', async () => {
    // The point of persisting a port is that `localStorage` is keyed by
    // origin; a launch that has to move accepts resetting those four
    // per-device settings once.
    const free = vi.fn(async (port: number) => port !== 54_321)

    const chosen = await choosePort(54_321, { free, random: () => 0.5 })

    expect(chosen).not.toBe(54_321)
    expect(chosen).toBeGreaterThanOrEqual(PORT_RANGE_MIN)
    expect(chosen).toBeLessThanOrEqual(PORT_RANGE_MAX)
  })

  it('picks one from the dynamic range on a first run', async () => {
    expect(await choosePort(undefined, { free: async () => true, random: () => 0 })).toBe(PORT_RANGE_MIN)
    expect(await choosePort(undefined, { free: async () => true, random: () => 0.999_999_9 })).toBe(PORT_RANGE_MAX)
  })

  it('keeps trying past a candidate that is taken', async () => {
    const candidates = [0, 0.1, 0.2]
    let call = 0
    const random = () => candidates[call++] ?? 0.3
    const free = async (port: number) => port !== PORT_RANGE_MIN

    expect(await choosePort(undefined, { free, random })).not.toBe(PORT_RANGE_MIN)
  })

  it('gives up rather than spinning when nothing is free', async () => {
    await expect(choosePort(undefined, { free: async () => false })).rejects.toThrow(NoFreePortError)
  })

  it('ignores a port a hand-edited config made nonsense', async () => {
    const free = vi.fn(async () => true)

    // 70000 is not a port; it must not be handed to `free`, let alone reused.
    expect(await choosePort(70_000, { free, random: () => 0 })).toBe(PORT_RANGE_MIN)
    expect(free).not.toHaveBeenCalledWith(70_000)
  })
})

describe('isUsablePort', () => {
  it.each([
    [54_321, true],
    [1, true],
    [65_535, true],
    [0, false],
    [65_536, false],
    [-1, false],
    [54_321.5, false],
    ['54321', false],
    [undefined, false],
    [null, false],
  ])('%p is %p', (value, expected) => {
    expect(isUsablePort(value)).toBe(expected)
  })
})
