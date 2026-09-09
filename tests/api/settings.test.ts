import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

describe('the microphone processing and Monitoring defaults', () => {
  test('start off', async () => {
    expect(await (await api.get('/api/settings')).json()).toMatchObject({
      micProcessingDefault: false,
      monitoringDefault: false,
    })
  })

  test('are saved and read back independently', async () => {
    const res = await api.put('/api/settings', { micProcessingDefault: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ micProcessingDefault: true, monitoringDefault: false })

    const after = await (await api.get('/api/settings')).json()
    expect(after).toMatchObject({ micProcessingDefault: true, monitoringDefault: false })

    await api.put('/api/settings', { monitoringDefault: true })
    const both = await (await api.get('/api/settings')).json()
    expect(both).toMatchObject({ micProcessingDefault: true, monitoringDefault: true })
  })

  test('saving one leaves the default Lyrics Provider alone', async () => {
    await api.put('/api/settings', { defaultLyricsProvider: 'genius' })
    await api.put('/api/settings', { micProcessingDefault: true })

    expect((await (await api.get('/api/settings')).json()).defaultLyricsProvider).toBe('genius')
  })

  test.each([
    { micProcessingDefault: 'on' },
    { monitoringDefault: 1 },
  ])('%j is rejected and leaves the defaults alone', async (body) => {
    await api.put('/api/settings', { micProcessingDefault: true, monitoringDefault: true })

    const res = await api.put('/api/settings', body)
    expect(res.status).toBe(400)

    expect(await (await api.get('/api/settings')).json()).toMatchObject({
      micProcessingDefault: true,
      monitoringDefault: true,
    })
  })
})

describe('saving nothing', () => {
  test('is rejected', async () => {
    const res = await api.put('/api/settings', {})
    expect(res.status).toBe(400)
  })
})
