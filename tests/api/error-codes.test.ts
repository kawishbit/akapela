import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'

/**
 * An API route's refusal keeps its English `statusMessage`, for logs and
 * anyone calling by hand, and adds `data: { code, params }`, which is what the
 * browser puts into the singer's Language (ADR 0014).
 */

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

describe('a refused request', () => {
  test('carries a code beside its English', async () => {
    const res = await api.get('/api/tracks/nope')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.statusMessage).toBe('Track not found')
    expect(body.data).toEqual({ code: 'trackNotFound', params: {} })
  })

  test('from something another device already took away', async () => {
    const res = await api.del('/api/queue/nope')
    expect(res.status).toBe(404)
    expect((await res.json()).data).toEqual({ code: 'queueEntryGone', params: {} })
  })

  test('a malformed one shares a code, its English saying what was wrong', async () => {
    const res = await api.put('/api/settings', {})
    const body = await res.json()
    expect(body.data.code).toBe('invalidRequest')
    expect(body.statusMessage).toBe('Nothing to save.')
  })

  test('a link that isn\'t one video', async () => {
    const res = await api.post('/api/tracks', { url: 'https://example.com' })
    expect((await res.json()).data.code).toBe('invalidYoutubeUrl')
  })
})
