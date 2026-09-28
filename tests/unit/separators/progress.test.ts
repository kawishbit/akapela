import { describe, expect, it } from 'vitest'
import { chunkProgressReader, cliOutputReader, formatNotice, parseChunkProgress } from '../../../server/lib/separators/progress'

describe('parseChunkProgress', () => {
  it('reads a progress line as a fraction', () => {
    expect(parseChunkProgress('progress 3/12')).toBe(0.25)
    expect(parseChunkProgress('progress 12/12\r')).toBe(1)
  })

  it('ignores anything else', () => {
    for (const line of ['', 'hello', 'progress', 'progress 3/0', 'progress x/12', 'progress 13/12', 'Progress 1/2 please']) {
      expect(parseChunkProgress(line)).toBeNull()
    }
  })
})

describe('chunkProgressReader', () => {
  it('reports each progress line, even one split across reads', () => {
    const seen: number[] = []
    const read = chunkProgressReader(fraction => seen.push(fraction))

    read('progress 1/4\nprog')
    read('ress 2/4\nsome noise\n')
    read(Buffer.from('progress 4/4\n'))

    expect(seen).toEqual([0.25, 0.5, 1])
  })
})

describe('cliOutputReader', () => {
  it('tells progress from notices, and a notice survives a newline in its text', () => {
    const fractions: number[] = []
    const notices: string[] = []
    const read = cliOutputReader({ onFraction: f => fractions.push(f), onNotice: n => notices.push(n) })

    read(`progress 1/2\n${formatNotice('could not lower\nthe priority')}progress 2/2\n`)

    expect(fractions).toEqual([0.5, 1])
    expect(notices).toEqual(['could not lower the priority'])
  })
})
