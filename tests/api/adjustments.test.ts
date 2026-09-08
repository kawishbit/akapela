import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

const MP3_BYTES = Buffer.from('ID3 not really an mp3 but the API stores it as delivered')

async function importTrack() {
  return (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()
}

const DEFAULTS = { pitchSemitones: 0, tempoPercent: 100, linked: false, reverbAmount: 0, lowpassHz: 20000, effectsTarget: 'backing' }

describe("a Track's last Adjustments", () => {
  test('a new Track starts at zero semitones, one hundred percent, unlinked, Effects bypassed and aimed at the backing', async () => {
    const track = await importTrack()
    expect(track.adjustments).toEqual(DEFAULTS)

    const fetched = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(fetched.adjustments).toEqual(DEFAULTS)
  })

  test('saving Adjustments returns the Track with them and restores them when the Track is opened again', async () => {
    const track = await importTrack()

    const saved = { pitchSemitones: -2, tempoPercent: 90, linked: false, reverbAmount: 25, lowpassHz: 6000, effectsTarget: 'both' }
    const res = await api.put(`/api/tracks/${track.id}/adjustments`, saved)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: track.id, adjustments: saved })

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened.adjustments).toEqual(saved)

    const listed = await (await api.get('/api/tracks')).json()
    expect(listed[0].adjustments).toEqual(saved)
  })

  test('the link flag is saved too', async () => {
    const track = await importTrack()
    await api.put(`/api/tracks/${track.id}/adjustments`, { ...DEFAULTS, tempoPercent: 120, linked: true })

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened.adjustments).toEqual({ ...DEFAULTS, tempoPercent: 120, linked: true })
  })

  test('a phase-one row already in the database, never re-saved since, still loads with both Effects bypassed and aimed at the backing', async () => {
    const track = await importTrack()
    // Bypasses the app entirely, the way a row written before this pair of
    // fields existed actually looks: no `parseAdjustments` has ever touched it.
    api.akapela.sqlite
      .prepare(`UPDATE tracks SET adjustments = ? WHERE id = ?`)
      .run(JSON.stringify({ pitchSemitones: 3, tempoPercent: 110, linked: false }), track.id)
    const expected = { pitchSemitones: 3, tempoPercent: 110, linked: false, reverbAmount: 0, lowpassHz: 20000, effectsTarget: 'backing' }

    const fetched = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(fetched.adjustments).toEqual(expected)

    const listed = await (await api.get('/api/tracks')).json()
    expect(listed[0].adjustments).toEqual(expected)
  })

  test('saving a phase-one three-field body defaults both Effects to bypassed', async () => {
    const track = await importTrack()
    const res = await api.put(`/api/tracks/${track.id}/adjustments`, { pitchSemitones: -2, tempoPercent: 90, linked: false })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ adjustments: { reverbAmount: 0, lowpassHz: 20000, effectsTarget: 'backing' } })

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened.adjustments).toEqual({ ...DEFAULTS, pitchSemitones: -2, tempoPercent: 90 })
  })

  test.each([
    { pitchSemitones: 13, tempoPercent: 100, linked: false },
    { pitchSemitones: 0, tempoPercent: 49, linked: false },
    { pitchSemitones: 0, tempoPercent: 151, linked: false },
    { pitchSemitones: 0.5, tempoPercent: 100, linked: false },
    { pitchSemitones: '2', tempoPercent: 100, linked: false },
    { pitchSemitones: 0, tempoPercent: 100 },
    { ...DEFAULTS, reverbAmount: -1 },
    { ...DEFAULTS, reverbAmount: 101 },
    { ...DEFAULTS, lowpassHz: 199 },
    { ...DEFAULTS, lowpassHz: 20001 },
    { ...DEFAULTS, effectsTarget: 'everything' },
    'slower please',
  ])('%j is rejected and leaves the saved Adjustments alone', async (body) => {
    const track = await importTrack()
    const kept = { pitchSemitones: 4, tempoPercent: 80, linked: false, reverbAmount: 10, lowpassHz: 5000, effectsTarget: 'vocal' }
    await api.put(`/api/tracks/${track.id}/adjustments`, kept)

    const res = await api.put(`/api/tracks/${track.id}/adjustments`, body)
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/whole-number pitch from -12 to 12/)

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened.adjustments).toEqual(kept)
  })

  test('saving Adjustments on an unknown Track is a 404', async () => {
    const res = await api.put('/api/tracks/nope/adjustments', DEFAULTS)
    expect(res.status).toBe(404)
  })
})
