import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { childEnv, ffmpegToolPath, separateCliPath, ytDlpPath } from '../../server/lib/tools'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('tool resolvers', () => {
  it('return the bare binary names when nothing is overridden', () => {
    expect(ffmpegToolPath('ffmpeg')).toBe('ffmpeg')
    expect(ffmpegToolPath('ffprobe')).toBe('ffprobe')
    expect(ytDlpPath()).toBe('yt-dlp')
  })

  it('resolve the separation CLI off the cwd when nothing is overridden', () => {
    expect(separateCliPath()).toBe(resolve(process.cwd(), 'server/lib/separators/separate-cli.ts'))
  })

  it('return the override when one is set', () => {
    vi.stubEnv('AKAPELA_FFMPEG', '/opt/akapela/ffmpeg')
    vi.stubEnv('AKAPELA_FFPROBE', '/opt/akapela/ffprobe')
    vi.stubEnv('AKAPELA_YTDLP', '/home/singer/.akapela/cache/bin/yt-dlp')
    vi.stubEnv('AKAPELA_SEPARATE_CLI', '/opt/akapela/separate-cli.js')

    expect(ffmpegToolPath('ffmpeg')).toBe('/opt/akapela/ffmpeg')
    expect(ffmpegToolPath('ffprobe')).toBe('/opt/akapela/ffprobe')
    expect(ytDlpPath()).toBe('/home/singer/.akapela/cache/bin/yt-dlp')
    expect(separateCliPath()).toBe('/opt/akapela/separate-cli.js')
  })

  it('ignores an override that is empty or only whitespace', () => {
    vi.stubEnv('AKAPELA_FFMPEG', '')
    vi.stubEnv('AKAPELA_YTDLP', '   ')

    expect(ffmpegToolPath('ffmpeg')).toBe('ffmpeg')
    expect(ytDlpPath()).toBe('yt-dlp')
  })

  it('trims an override, so a stray newline from a config file does not reach spawn', () => {
    vi.stubEnv('AKAPELA_FFPROBE', ' /opt/akapela/ffprobe\n')

    expect(ffmpegToolPath('ffprobe')).toBe('/opt/akapela/ffprobe')
  })
})

describe('childEnv', () => {
  it('sets ELECTRON_RUN_AS_NODE so a spawned execPath is Node rather than a second window', () => {
    expect(childEnv().ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('carries this process\'s environment through', () => {
    vi.stubEnv('AKAPELA_TEST_MARKER', 'carried')

    expect(childEnv().AKAPELA_TEST_MARKER).toBe('carried')
  })

  it('lets the caller add to it', () => {
    expect(childEnv({ PATH: '/manufactured/bin' }).PATH).toBe('/manufactured/bin')
  })
})
