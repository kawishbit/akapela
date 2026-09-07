import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

const CUSTOM_PRESET = {
  name: 'My Sound',
  adjustments: { pitchSemitones: -2, tempoPercent: 90, linked: false, reverbAmount: 40, lowpassHz: 12000 },
}

describe('listing Presets', () => {
  test('lists the three built-ins before any user Presets', async () => {
    const list = await (await api.get('/api/presets')).json()
    expect(list.map((p: { name: string, builtIn: boolean }) => [p.name, p.builtIn])).toEqual([
      ['Slowed and Reverb', true],
      ['Nightcore', true],
      ['Practice', true],
    ])
  })

  test('lists user Presets after the built-ins, newest first', async () => {
    const first = await (await api.post('/api/presets', CUSTOM_PRESET)).json()
    const second = await (await api.post('/api/presets', { ...CUSTOM_PRESET, name: 'Another Sound' })).json()

    const list = await (await api.get('/api/presets')).json()
    expect(list.slice(0, 3).every((p: { builtIn: boolean }) => p.builtIn)).toBe(true)
    expect(list.slice(3).map((p: { id: string }) => p.id)).toEqual([second.id, first.id])
  })
})

describe('creating a Preset', () => {
  test('saves the submitted Adjustments under a name', async () => {
    const res = await api.post('/api/presets', CUSTOM_PRESET)
    expect(res.status).toBe(201)
    const preset = await res.json()
    expect(preset).toMatchObject({
      name: 'My Sound',
      pitchSemitones: -2,
      tempoPercent: 90,
      linked: false,
      reverbAmount: 40,
      lowpassHz: 12000,
      builtIn: false,
    })
  })

  test('rejects a blank name and creates no Preset', async () => {
    const res = await api.post('/api/presets', { ...CUSTOM_PRESET, name: '   ' })
    expect(res.status).toBe(400)
    expect(await (await api.get('/api/presets')).json()).toHaveLength(3)
  })

  test('rejects a name already taken, case-insensitively, by a built-in or a user Preset', async () => {
    expect((await api.post('/api/presets', { ...CUSTOM_PRESET, name: 'nightcore' })).status).toBe(409)

    await api.post('/api/presets', CUSTOM_PRESET)
    expect((await api.post('/api/presets', { ...CUSTOM_PRESET, name: 'MY SOUND' })).status).toBe(409)
    expect(await (await api.get('/api/presets')).json()).toHaveLength(4)
  })

  test.each([
    {},
    { ...CUSTOM_PRESET, adjustments: { ...CUSTOM_PRESET.adjustments, pitchSemitones: 99 } },
    { ...CUSTOM_PRESET, adjustments: { ...CUSTOM_PRESET.adjustments, tempoPercent: 999 } },
    { ...CUSTOM_PRESET, adjustments: { ...CUSTOM_PRESET.adjustments, reverbAmount: -1 } },
    { ...CUSTOM_PRESET, adjustments: { ...CUSTOM_PRESET.adjustments, lowpassHz: 50 } },
  ])('invalid request %j is rejected and creates no Preset', async (body) => {
    const res = await api.post('/api/presets', body)
    expect(res.status).toBe(400)
    expect(await (await api.get('/api/presets')).json()).toHaveLength(3)
  })
})

describe('deleting a Preset', () => {
  test('removes a user Preset', async () => {
    const preset = await (await api.post('/api/presets', CUSTOM_PRESET)).json()
    const res = await api.del(`/api/presets/${preset.id}`)
    expect(res.status).toBe(204)
    expect(await (await api.get('/api/presets')).json()).toHaveLength(3)
  })

  test('rejects deleting a built-in with a message saying it ships with the app', async () => {
    const list = await (await api.get('/api/presets')).json()
    const builtIn = list.find((p: { builtIn: boolean }) => p.builtIn)

    const res = await api.del(`/api/presets/${builtIn.id}`)
    expect(res.status).toBe(409)
    expect((await res.json()).statusMessage).toMatch(/ships with the app/)
    expect(await (await api.get('/api/presets')).json()).toHaveLength(3)
  })

  test('deleting an unknown Preset is a 404', async () => {
    expect((await api.del('/api/presets/nope')).status).toBe(404)
  })
})
