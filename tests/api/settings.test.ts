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

describe('CPU cores', () => {
  test('describes the machine hosting Akapela, and starts at all its cores but one', async () => {
    expect(await (await api.get('/api/settings')).json()).toMatchObject({
      cpuCores: 7,
      hardware: { cores: 8 },
    })
  })

  test('is saved and read back', async () => {
    const res = await api.put('/api/settings', { cpuCores: 2 })
    expect(res.status).toBe(200)
    expect((await res.json()).cpuCores).toBe(2)
    expect((await (await api.get('/api/settings')).json()).cpuCores).toBe(2)
  })

  test.each([0, 9, 2.5, '4'])('%j is rejected on an 8-core machine', async (cpuCores) => {
    const res = await api.put('/api/settings', { cpuCores })
    expect(res.status).toBe(400)
    expect((await (await api.get('/api/settings')).json()).cpuCores).toBe(7)
  })
})

describe('CPU cores saved on bigger hardware', () => {
  test('is clamped to the machine it is read on, and kept as it was', async () => {
    const small = await createTestApi({ hardware: { cores: 4 } })
    try {
      // What a library restored from a 16-core server brings with it.
      small.akapela.sqlite.prepare(`INSERT INTO settings (id, cpu_cores, updated_at) VALUES (1, 12, 0)`).run()
      expect((await (await small.get('/api/settings')).json()).cpuCores).toBe(4)
      expect(small.akapela.sqlite.prepare(`SELECT cpu_cores FROM settings`).get()).toEqual({ cpu_cores: 12 })
    }
    finally {
      await small.close()
    }
  })
})

describe('the Audio Format', () => {
  test('is WAV when never set, with WAV, FLAC, and MP3 on offer', async () => {
    expect(await (await api.get('/api/settings')).json()).toMatchObject({
      audioFormat: 'wav',
      audioFormats: ['wav', 'flac', 'mp3'],
    })
  })

  test('is saved and read back', async () => {
    expect((await (await api.put('/api/settings', { audioFormat: 'flac' })).json()).audioFormat).toBe('flac')
    expect((await (await api.get('/api/settings')).json()).audioFormat).toBe('flac')
  })

  test.each(['ogg', 'FLAC', 'opus', 1])('%j is rejected', async (audioFormat) => {
    expect((await api.put('/api/settings', { audioFormat })).status).toBe(400)
  })
})
