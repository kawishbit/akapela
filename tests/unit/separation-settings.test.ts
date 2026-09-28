import { describe, expect, test } from 'vitest'
import { cpuCoresFor, defaultCpuCores, parseCpuCores } from '../../shared/separation'

describe('defaultCpuCores', () => {
  test('leaves one core for everything else', () => {
    expect(defaultCpuCores(8)).toBe(7)
    expect(defaultCpuCores(2)).toBe(1)
  })

  test('is never less than one', () => {
    expect(defaultCpuCores(1)).toBe(1)
    expect(defaultCpuCores(0)).toBe(1)
  })
})

describe('cpuCoresFor', () => {
  test('is the default when nothing was chosen', () => {
    expect(cpuCoresFor(null, 8)).toBe(7)
  })

  test('is what was chosen when this machine has that many', () => {
    expect(cpuCoresFor(3, 8)).toBe(3)
    expect(cpuCoresFor(8, 8)).toBe(8)
  })

  test('clamps a choice saved on bigger hardware to what this machine has', () => {
    expect(cpuCoresFor(16, 4)).toBe(4)
  })

  test('is never less than one', () => {
    expect(cpuCoresFor(0, 4)).toBe(1)
    expect(cpuCoresFor(3, 0)).toBe(1)
  })
})

describe('parseCpuCores', () => {
  test('accepts a whole number from one to the core count', () => {
    expect(parseCpuCores(1, 8)).toBe(1)
    expect(parseCpuCores(8, 8)).toBe(8)
  })

  test.each([0, 9, 2.5, '4', null, -1, Number.NaN])('rejects %j on an 8-core machine', (value) => {
    expect(parseCpuCores(value, 8)).toBeNull()
  })
})
