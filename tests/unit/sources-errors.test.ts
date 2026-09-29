import { afterEach, describe, expect, test, vi } from 'vitest'
import { ytDlpFailure } from '../../server/lib/sources'

afterEach(() => vi.unstubAllEnvs())

describe('ytDlpFailure', () => {
  test('a video YouTube hands over to nobody is unavailable, whatever yt-dlp version', () => {
    for (const stderr of [
      'ERROR: [youtube] abc: Video unavailable',
      'ERROR: [youtube] abc: Private video. Sign in if you\'ve been granted access',
      'ERROR: [youtube] abc: Sign in to confirm your age.',
    ]) {
      expect(ytDlpFailure(stderr, 1).code).toBe('videoUnavailable')
    }
  })

  test('a missing JavaScript runtime says so', () => {
    vi.stubEnv('AKAPELA_JS_RUNTIME', '')
    expect(ytDlpFailure('WARNING: No supported JavaScript runtime could be found (--js-runtimes)', 1).code).toBe('jsRuntimeMissing')
  })

  test('anything else is yt-dlp failing, with its own words kept for the log', () => {
    const error = ytDlpFailure('ERROR: [youtube] abc: nsig extraction failed', 1)
    expect(error.code).toBe('ytDlpFailed')
    expect(error.message).toBe('[youtube] abc: nsig extraction failed')
  })
})
