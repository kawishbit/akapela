import { describe, expect, test } from 'vitest'
import { parseBrowserLogs } from '../../server/lib/browser-logs'
import { MAX_BROWSER_LOG_BATCH, MAX_BROWSER_LOG_MESSAGE } from '../../shared/browser-log'

const entry = (over: Record<string, unknown> = {}) => ({
  level: 'error',
  message: 'getUserMedia failed',
  at: 1788630000000,
  page: '/tracks/abc/sing',
  ...over,
})

describe('parseBrowserLogs', () => {
  test('a well-formed batch survives intact', () => {
    expect(parseBrowserLogs({ entries: [entry()] })).toEqual([{
      level: 'error',
      message: 'getUserMedia failed',
      at: 1788630000000,
      page: '/tracks/abc/sing',
      stack: null,
    }])
  })

  test('a stack is kept when the browser sent one', () => {
    const [parsed] = parseBrowserLogs({ entries: [entry({ stack: 'at record (sing.vue:12)' })] })
    expect(parsed?.stack).toBe('at record (sing.vue:12)')
  })

  test('warnings are kept too, since a warning is often the first sign', () => {
    expect(parseBrowserLogs({ entries: [entry({ level: 'warn' })] })[0]?.level).toBe('warn')
  })

  test('levels below a warning are dropped rather than flooding the dashboard', () => {
    expect(parseBrowserLogs({ entries: [entry({ level: 'log' }), entry({ level: 'debug' })] })).toEqual([])
  })

  test('an entry with no message is dropped', () => {
    expect(parseBrowserLogs({ entries: [entry({ message: '' }), entry({ message: 42 })] })).toEqual([])
  })

  test('a long message is truncated, so one runaway log cannot be a payload', () => {
    const [parsed] = parseBrowserLogs({ entries: [entry({ message: 'x'.repeat(MAX_BROWSER_LOG_MESSAGE + 500) })] })
    expect(parsed?.message).toHaveLength(MAX_BROWSER_LOG_MESSAGE)
  })

  test('an oversized batch is cut to the cap', () => {
    const entries = Array.from({ length: MAX_BROWSER_LOG_BATCH + 20 }, () => entry())
    expect(parseBrowserLogs({ entries })).toHaveLength(MAX_BROWSER_LOG_BATCH)
  })

  test('a missing or unusable timestamp falls back to nothing rather than NaN', () => {
    expect(parseBrowserLogs({ entries: [entry({ at: 'yesterday' })] })[0]?.at).toBeNull()
  })

  test('a body that is not a batch at all yields nothing', () => {
    expect(parseBrowserLogs(null)).toEqual([])
    expect(parseBrowserLogs({})).toEqual([])
    expect(parseBrowserLogs({ entries: 'oops' })).toEqual([])
    expect(parseBrowserLogs({ entries: [null, 7] })).toEqual([])
  })
})
