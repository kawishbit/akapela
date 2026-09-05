import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createConsoleRelay } from '../../app/utils/console-relay'
import { MAX_BROWSER_LOG_BATCH, MAX_BROWSER_LOG_MESSAGE, type BrowserLogEntry } from '../../shared/browser-log'

let sent: BrowserLogEntry[][]

function relay(delayMs = 2000) {
  return createConsoleRelay({
    send: entries => sent.push(entries),
    page: () => '/tracks/abc/sing',
    now: () => 1788630000000,
    delayMs,
  })
}

beforeEach(() => {
  sent = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('what the relay records', () => {
  test('a console error becomes one entry, stamped with the page it happened on', () => {
    const console = relay()
    console.record('error', ['getUserMedia failed'])
    console.flush()

    expect(sent).toEqual([[{
      level: 'error',
      message: 'getUserMedia failed',
      at: 1788630000000,
      page: '/tracks/abc/sing',
      stack: null,
    }]])
  })

  test('every argument is kept, the way the console would have shown them', () => {
    const console = relay()
    console.record('warn', ['take', 3, { id: 'abc' }])
    console.flush()

    expect(sent[0]?.[0]?.message).toBe('take 3 {"id":"abc"}')
  })

  test("an Error argument brings its stack, which is the part worth having", () => {
    const error = new Error('decode failed')
    error.stack = 'Error: decode failed\n    at record (recorder.ts:40)'
    const console = relay()
    console.record('error', ['while recording', error])
    console.flush()

    expect(sent[0]?.[0]?.message).toBe('while recording Error: decode failed')
    expect(sent[0]?.[0]?.stack).toBe(error.stack)
  })

  test('an argument that cannot be turned into text does not become a second failure', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const console = relay()

    expect(() => console.record('error', [circular])).not.toThrow()
    console.flush()
    expect(sent[0]?.[0]?.message).toBeTypeOf('string')
  })

  test('a runaway message is cut before it leaves the page', () => {
    const console = relay()
    console.record('error', ['x'.repeat(MAX_BROWSER_LOG_MESSAGE + 500)])
    console.flush()

    expect(sent[0]?.[0]?.message).toHaveLength(MAX_BROWSER_LOG_MESSAGE)
  })
})

describe('when the relay sends', () => {
  test('entries collect into one batch rather than one request each', () => {
    const console = relay(2000)
    console.record('error', ['first'])
    console.record('error', ['second'])
    expect(sent).toEqual([])

    vi.advanceTimersByTime(2000)

    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(2)
  })

  test('nothing queued is nothing sent, so an idle page is silent', () => {
    relay().flush()
    vi.advanceTimersByTime(10_000)

    expect(sent).toEqual([])
  })

  test('a flushed batch is not sent again when the timer comes round', () => {
    const console = relay(2000)
    console.record('error', ['boom'])
    console.flush()
    vi.advanceTimersByTime(10_000)

    expect(sent).toHaveLength(1)
  })

  test('a page logging in a loop fills the batch and then stays quiet', () => {
    const console = relay()
    for (let i = 0; i < MAX_BROWSER_LOG_BATCH + 100; i++) console.record('error', [`boom ${i}`])
    console.flush()

    expect(sent[0]).toHaveLength(MAX_BROWSER_LOG_BATCH)
    expect(sent[0]?.[0]?.message).toBe('boom 0')
  })
})
