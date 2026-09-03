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

describe("a Track's last Adjustments", () => {
  test('a new Track starts at zero semitones, one hundred percent, unlinked', async () => {
    const track = await importTrack()
    expect(track.adjustments).toEqual({ pitchSemitones: 0, tempoPercent: 100, linked: false })

    const fetched = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(fetched.adjustments).toEqual({ pitchSemitones: 0, tempoPercent: 100, linked: false })
  })

  test('saving Adjustments returns the Track with them and restores them when the Track is opened again', async () => {
    const track = await importTrack()

    const res = await api.put(`/api/tracks/${track.id}/adjustments`, {
      pitchSemitones: -2,
      tempoPercent: 90,
      linked: false,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: track.id,
      adjustments: { pitchSemitones: -2, tempoPercent: 90, linked: false },
    })

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened.adjustments).toEqual({ pitchSemitones: -2, tempoPercent: 90, linked: false })

    const listed = await (await api.get('/api/tracks')).json()
    expect(listed[0].adjustments).toEqual({ pitchSemitones: -2, tempoPercent: 90, linked: false })
  })

  test('the link flag is saved too', async () => {
    const track = await importTrack()
    await api.put(`/api/tracks/${track.id}/adjustments`, { pitchSemitones: 0, tempoPercent: 120, linked: true })

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened.adjustments).toEqual({ pitchSemitones: 0, tempoPercent: 120, linked: true })
  })

  test.each([
    { pitchSemitones: 13, tempoPercent: 100, linked: false },
    { pitchSemitones: 0, tempoPercent: 49, linked: false },
    { pitchSemitones: 0, tempoPercent: 151, linked: false },
    { pitchSemitones: 0.5, tempoPercent: 100, linked: false },
    { pitchSemitones: '2', tempoPercent: 100, linked: false },
    { pitchSemitones: 0, tempoPercent: 100 },
    'slower please',
  ])('%j is rejected and leaves the saved Adjustments alone', async (body) => {
    const track = await importTrack()
    await api.put(`/api/tracks/${track.id}/adjustments`, { pitchSemitones: 4, tempoPercent: 80, linked: false })

    const res = await api.put(`/api/tracks/${track.id}/adjustments`, body)
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/whole-number pitch from -12 to 12/)

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened.adjustments).toEqual({ pitchSemitones: 4, tempoPercent: 80, linked: false })
  })

  test('saving Adjustments on an unknown Track is a 404', async () => {
    const res = await api.put('/api/tracks/nope/adjustments', { pitchSemitones: 0, tempoPercent: 100, linked: false })
    expect(res.status).toBe(404)
  })
})
