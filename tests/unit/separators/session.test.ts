import { constants } from 'node:os'
import { describe, expect, it } from 'vitest'
import { lowerOwnPriority } from '../../../server/lib/separators/priority'
import { cpuSessionOptions } from '../../../server/lib/separators/session'

describe('cpuSessionOptions', () => {
  it('uses exactly as many intra-op threads as the core limit', () => {
    expect(cpuSessionOptions(3)).toMatchObject({ executionProviders: ['cpu'], intraOpNumThreads: 3 })
  })

  it('keeps the CPU arena off, which the macOS Desktop App needs under Electron', () => {
    expect(cpuSessionOptions(1).enableCpuMemArena).toBe(false)
  })
})

describe('lowerOwnPriority', () => {
  it('asks for below normal priority', () => {
    const asked: number[] = []
    expect(lowerOwnPriority(priority => asked.push(priority))).toBeNull()
    expect(asked).toEqual([constants.priority.PRIORITY_BELOW_NORMAL])
  })

  it('says why when it cannot, rather than throwing', () => {
    const problem = lowerOwnPriority(() => {
      throw new Error('EACCES')
    })
    expect(problem).toMatch(/could not lower .*EACCES/)
  })
})
