import { describe, expect, test } from 'vitest'
import { currentTraceParent, traceRequestAs } from '../../server/lib/request-trace'

const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
const OTHER = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'

describe('the trace of the request being handled', () => {
  test('is nothing when nobody is tracing', () => {
    expect(currentTraceParent()).toBeNull()
  })

  test('is what the request was marked with, for as long as it runs', async () => {
    async function handle() {
      traceRequestAs(TRACEPARENT)
      await Promise.resolve()
      return currentTraceParent()
    }

    expect(await handle()).toBe(TRACEPARENT)
  })

  test('does not leak between requests running at the same time', async () => {
    async function handle(traceParent: string) {
      const done = traceRequestAs(traceParent)
      await new Promise(resolve => setTimeout(resolve, 5))
      const seen = currentTraceParent()
      done()
      return seen
    }

    expect(await Promise.all([handle(TRACEPARENT), handle(OTHER)])).toEqual([TRACEPARENT, OTHER])
  })

  test('is gone once the response is out, wherever the store reached', async () => {
    async function handle() {
      traceRequestAs(TRACEPARENT)()
    }

    await handle()
    expect(currentTraceParent()).toBeNull()
  })
})
