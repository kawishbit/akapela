import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
const WAV_BYTES = Buffer.from('RIFF....WAVEfmt data0123456789')

const VALID_META = { startPositionMs: 12_000, durationMs: 8_000, adjustments: { pitchSemitones: 2, tempoPercent: 90, linked: false } }

async function createTrack() {
  return (await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()) as { id: string }
}

describe('uploading a Take', () => {
  test('is created with its metadata, its Adjustments defaulting nudge and gains to no correction', async () => {
    const track = await createTrack()

    const res = await api.uploadTake(track.id, WAV_BYTES, VALID_META)
    expect(res.status).toBe(201)
    const take = await res.json()

    expect(take).toMatchObject({
      trackId: track.id,
      startPositionMs: 12_000,
      durationMs: 8_000,
      adjustments: VALID_META.adjustments,
      latencyNudgeMs: 0,
      vocalGain: 1,
      backingGain: 1,
    })
    expect(take.filePath).toBe(`takes/${take.id}.wav`)
  })

  test('the WAV is stored as delivered under the Track directory', async () => {
    const track = await createTrack()

    const take = await (await api.uploadTake(track.id, WAV_BYTES, VALID_META)).json()

    const stored = readFileSync(join(api.dataDir, 'tracks', track.id, 'takes', `${take.id}.wav`))
    expect(stored.equals(WAV_BYTES)).toBe(true)
  })

  test('appears on the Track detail response', async () => {
    const track = await createTrack()
    const take = await (await api.uploadTake(track.id, WAV_BYTES, VALID_META)).json()

    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.takes.map((t: { id: string }) => t.id)).toEqual([take.id])
  })

  test('a request with no file is rejected', async () => {
    const track = await createTrack()
    const form = new FormData()
    form.append('meta', JSON.stringify(VALID_META))
    const res = await fetch(`${api.baseUrl}/api/tracks/${track.id}/takes`, { method: 'POST', body: form })
    expect(res.status).toBe(400)
  })

  test.each([
    {},
    { startPositionMs: -1, durationMs: 8_000, adjustments: VALID_META.adjustments },
    { startPositionMs: 12_000, durationMs: 0, adjustments: VALID_META.adjustments },
    { startPositionMs: 12.5, durationMs: 8_000, adjustments: VALID_META.adjustments },
    { startPositionMs: 12_000, durationMs: 8_000, adjustments: { pitchSemitones: 99, tempoPercent: 100, linked: false } },
  ])('invalid metadata %j is rejected and creates no Take', async (meta) => {
    const track = await createTrack()
    const res = await api.uploadTake(track.id, WAV_BYTES, meta)
    expect(res.status).toBe(400)
    expect(await (await api.get(`/api/tracks/${track.id}/takes`)).json()).toEqual([])
  })

  test('uploading to an unknown Track is a 404', async () => {
    const res = await api.uploadTake('nope', WAV_BYTES, VALID_META)
    expect(res.status).toBe(404)
  })
})

describe('listing Takes', () => {
  test('lists every Take of a Track, newest first', async () => {
    const track = await createTrack()
    const first = await (await api.uploadTake(track.id, WAV_BYTES, VALID_META)).json()
    const second = await (await api.uploadTake(track.id, WAV_BYTES, { ...VALID_META, startPositionMs: 0 })).json()

    const list = await (await api.get(`/api/tracks/${track.id}/takes`)).json()
    expect(list.map((t: { id: string }) => t.id)).toEqual([second.id, first.id])
  })

  test('an unknown Track is a 404', async () => {
    expect((await api.get('/api/tracks/nope/takes')).status).toBe(404)
  })
})

describe('deleting a Take', () => {
  test('removes the Take and its file from disk', async () => {
    const track = await createTrack()
    const take = await (await api.uploadTake(track.id, WAV_BYTES, VALID_META)).json()
    const file = join(api.dataDir, 'tracks', track.id, 'takes', `${take.id}.wav`)
    expect(existsSync(file)).toBe(true)

    const res = await api.del(`/api/tracks/${track.id}/takes/${take.id}`)
    expect(res.status).toBe(204)

    expect(existsSync(file)).toBe(false)
    expect(await (await api.get(`/api/tracks/${track.id}/takes`)).json()).toEqual([])
  })

  test('deleting an unknown Take is a 404', async () => {
    const track = await createTrack()
    expect((await api.del(`/api/tracks/${track.id}/takes/nope`)).status).toBe(404)
  })

  test('a Take id from another Track is a 404, not cross-Track deletable', async () => {
    const trackA = await createTrack()
    const trackB = await createTrack()
    const take = await (await api.uploadTake(trackA.id, WAV_BYTES, VALID_META)).json()

    const res = await api.del(`/api/tracks/${trackB.id}/takes/${take.id}`)
    expect(res.status).toBe(404)
    expect(await (await api.get(`/api/tracks/${trackA.id}/takes`)).json()).toHaveLength(1)
  })
})
