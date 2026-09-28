import { describe, expect, it } from 'vitest'
import { formatSeparateCliArgs, parseSeparateCliArgs, type SeparateCliArgs } from '../../../server/lib/separators/cli-args'

const ARGS: SeparateCliArgs = {
  modelPath: '/cache/models/UVR-MDX-NET-Inst_Main.onnx',
  inputPath: '/tracks/t1/backing.wav',
  instrumentalPath: '/tmp/instrumental.wav',
  vocalsPath: '/tmp/vocals.wav',
  threads: 3,
}

describe('the separate CLI command line', () => {
  it('reads back exactly what the Job wrote', () => {
    expect(parseSeparateCliArgs(formatSeparateCliArgs(ARGS))).toEqual(ARGS)
  })

  it('says what is missing', () => {
    const argv = formatSeparateCliArgs(ARGS).slice(2)
    expect(parseSeparateCliArgs(argv)).toMatch(/missing --model/)
  })

  it.each(['0', '2.5', 'many'])('refuses %j threads', (threads) => {
    const argv = formatSeparateCliArgs(ARGS)
    argv[argv.indexOf('--threads') + 1] = threads
    expect(parseSeparateCliArgs(argv)).toMatch(/--threads/)
  })
})
