import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'
import { MAX_BROWSER_LOG_BATCH } from '../../shared/browser-log'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

const entry = (over: Record<string, unknown> = {}) => ({
  level: 'error',
  message: 'getUserMedia failed',
  at: 1788630000000,
  page: '/tracks/abc/sing',
  ...over,
})

describe('the browser log relay', () => {
  test('a batch reaches telemetry', async () => {
    const res = await api.post('/api/telemetry/browser', { entries: [entry()] })

    expect(res.status).toBe(204)
    expect(api.browserLogs).toEqual([{
      level: 'error',
      message: 'getUserMedia failed',
      at: 1788630000000,
      page: '/tracks/abc/sing',
      stack: null,
    }])
  })

  test('noise is dropped without the page ever hearing about it', async () => {
    const res = await api.post('/api/telemetry/browser', { entries: [entry({ level: 'log' })] })

    expect(res.status).toBe(204)
    expect(api.browserLogs).toEqual([])
  })

  test('a body that is not a batch is accepted and ignored, so no page retries', async () => {
    expect((await api.post('/api/telemetry/browser', { entries: 'oops' })).status).toBe(204)
    expect((await api.post('/api/telemetry/browser', null)).status).toBe(204)
    expect(api.browserLogs).toEqual([])
  })

  test('a page logging in a loop cannot flood the dashboard through one request', async () => {
    await api.post('/api/telemetry/browser', {
      entries: Array.from({ length: MAX_BROWSER_LOG_BATCH + 50 }, () => entry()),
    })

    expect(api.browserLogs).toHaveLength(MAX_BROWSER_LOG_BATCH)
  })

  test('with telemetry off the relay is still a 204, not a 500', async () => {
    api.stopRecordingBrowserLogs()

    const res = await api.post('/api/telemetry/browser', { entries: [entry()] })

    expect(res.status).toBe(204)
  })
})
