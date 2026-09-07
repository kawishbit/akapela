import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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

const MP3_BYTES = Buffer.from('Yesterday, all my troubles seemed so far away')
const TAKE_WAV_BYTES = Buffer.from('RIFF....WAVEfmt data0123456789')
const RENDERED_MP3_BYTES = Buffer.from('a very small rendered Mix, standing in for a real MP3')
const RENDERED_WAV_BYTES = Buffer.from('a very small rendered Mix, standing in for a real WAV')

const TAKE_META = { startPositionMs: 12_000, durationMs: 8_000, adjustments: { pitchSemitones: 2, tempoPercent: 90, linked: false } }

const MIX_REQUEST = {
  adjustments: { pitchSemitones: 3, tempoPercent: TAKE_META.adjustments.tempoPercent, linked: false },
  latencyNudgeMs: 40,
  vocalGain: 1.2,
  backingGain: 0.9,
  wav: false,
}

async function createTrackWithTake() {
  const track = (await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()) as { id: string }
  const take = await (await api.uploadTake(track.id, TAKE_WAV_BYTES, TAKE_META)).json()
  return { track, take }
}

/** Writes a Mix's rendered files under its Track directory and marks it done, the way the worker would. */
function writeRenderedFiles(trackId: string, mixId: string, opts: { wav: boolean }) {
  const dir = join(api.dataDir, 'tracks', trackId, 'mixes')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${mixId}.mp3`), RENDERED_MP3_BYTES)
  if (opts.wav) writeFileSync(join(dir, `${mixId}.wav`), RENDERED_WAV_BYTES)
}

describe('requesting a Mix', () => {
  test('is created with a queued render Job and the Take\'s tempo, not the request\'s', async () => {
    const { track, take } = await createTrackWithTake()

    const res = await api.requestMix(track.id, take.id, MIX_REQUEST)
    expect(res.status).toBe(201)
    const mix = await res.json()

    expect(mix).toMatchObject({
      takeId: take.id,
      mp3Path: null,
      wavPath: null,
      wavRequested: false,
      pitchSemitones: 3,
      tempoPercent: TAKE_META.adjustments.tempoPercent,
      linked: false,
      latencyNudgeMs: 40,
      vocalGain: 1.2,
      backingGain: 0.9,
    })
    expect(mix.job).toMatchObject({ id: mix.jobId, type: 'render', targetId: mix.id, state: 'queued' })
  })

  test('records wavRequested so a later WAV download can be told apart from one still rendering', async () => {
    const { track, take } = await createTrackWithTake()

    const res = await api.requestMix(track.id, take.id, { ...MIX_REQUEST, wav: true })
    expect((await res.json()).wavRequested).toBe(true)
  })

  test('carries the requested Effects onto the row, defaulting a phase-one-shaped request to bypassed', async () => {
    const { track, take } = await createTrackWithTake()

    const withEffects = await (await api.requestMix(track.id, take.id, {
      ...MIX_REQUEST,
      adjustments: { ...MIX_REQUEST.adjustments, reverbAmount: 65, lowpassHz: 8000 },
    })).json()
    expect(withEffects).toMatchObject({ reverbAmount: 65, lowpassHz: 8000 })

    const threeFieldRequest = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()
    expect(threeFieldRequest).toMatchObject({ reverbAmount: 0, lowpassHz: 20000 })
  })

  test('appears on the Track detail response, alongside its Take', async () => {
    const { track, take } = await createTrackWithTake()
    const mix = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()

    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.mixes.map((m: { id: string }) => m.id)).toEqual([mix.id])
    expect(detail.mixes[0].takeId).toBe(take.id)
  })

  test('rejects a request for a different tempo and creates no Mix', async () => {
    const { track, take } = await createTrackWithTake()

    const res = await api.requestMix(track.id, take.id, {
      ...MIX_REQUEST,
      adjustments: { ...MIX_REQUEST.adjustments, tempoPercent: TAKE_META.adjustments.tempoPercent + 10 },
    })
    expect(res.status).toBe(400)
    expect(await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()).toEqual([])
  })

  test.each([
    {},
    { ...MIX_REQUEST, latencyNudgeMs: 600 },
    { ...MIX_REQUEST, vocalGain: -1 },
    { ...MIX_REQUEST, backingGain: 3 },
    { ...MIX_REQUEST, wav: 'yes' },
    { ...MIX_REQUEST, adjustments: { pitchSemitones: 99, tempoPercent: TAKE_META.adjustments.tempoPercent, linked: false } },
  ])('invalid request %j is rejected and creates no Mix', async (body) => {
    const { track, take } = await createTrackWithTake()
    const res = await api.requestMix(track.id, take.id, body)
    expect(res.status).toBe(400)
    expect(await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()).toEqual([])
  })

  test('requesting on an unknown Take is a 404', async () => {
    const track = (await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()) as { id: string }
    expect((await api.requestMix(track.id, 'nope', MIX_REQUEST)).status).toBe(404)
  })
})

describe('listing Mixes', () => {
  test('lists every Mix of a Take, newest first', async () => {
    const { track, take } = await createTrackWithTake()
    const first = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()
    const second = await (await api.requestMix(track.id, take.id, { ...MIX_REQUEST, vocalGain: 1.5 })).json()

    const list = await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()
    expect(list.map((m: { id: string }) => m.id)).toEqual([second.id, first.id])
  })

  test('an unknown Take is a 404', async () => {
    const track = (await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()) as { id: string }
    expect((await api.get(`/api/tracks/${track.id}/takes/nope/mixes`)).status).toBe(404)
  })
})

describe('streaming a Mix\'s audio', () => {
  test('serves the rendered MP3 once the render Job finishes', async () => {
    const { track, take } = await createTrackWithTake()
    const mix = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()

    // Before the worker has finished, there is nothing to stream yet.
    expect((await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes/${mix.id}/audio`)).status).toBe(404)

    writeRenderedFiles(track.id, mix.id, { wav: false })
    api.finishMix(mix.id, mix.jobId, { mp3Path: `mixes/${mix.id}.mp3` })

    const res = await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes/${mix.id}/audio`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(Buffer.from(await res.arrayBuffer()).equals(RENDERED_MP3_BYTES)).toBe(true)
  })

  test('serves the WAV under ?format=wav when one was rendered, and 404s when it was not requested', async () => {
    const { track, take } = await createTrackWithTake()
    const mix = await (await api.requestMix(track.id, take.id, { ...MIX_REQUEST, wav: true })).json()
    writeRenderedFiles(track.id, mix.id, { wav: true })
    api.finishMix(mix.id, mix.jobId, { mp3Path: `mixes/${mix.id}.mp3`, wavPath: `mixes/${mix.id}.wav` })

    const wavRes = await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes/${mix.id}/audio?format=wav`)
    expect(wavRes.status).toBe(200)
    expect(wavRes.headers.get('content-type')).toBe('audio/wav')
    expect(Buffer.from(await wavRes.arrayBuffer()).equals(RENDERED_WAV_BYTES)).toBe(true)

    const noWav = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()
    writeRenderedFiles(track.id, noWav.id, { wav: false })
    api.finishMix(noWav.id, noWav.jobId, { mp3Path: `mixes/${noWav.id}.mp3` })
    expect((await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes/${noWav.id}/audio?format=wav`)).status).toBe(404)
  })

  test('an unknown Mix is a 404', async () => {
    const { track, take } = await createTrackWithTake()
    expect((await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes/nope/audio`)).status).toBe(404)
  })

  test('a Mix id from another Take is a 404', async () => {
    const { track, take } = await createTrackWithTake()
    const otherTake = await (await api.uploadTake(track.id, TAKE_WAV_BYTES, TAKE_META)).json()
    const mix = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()
    writeRenderedFiles(track.id, mix.id, { wav: false })
    api.finishMix(mix.id, mix.jobId, { mp3Path: `mixes/${mix.id}.mp3` })

    expect((await api.get(`/api/tracks/${track.id}/takes/${otherTake.id}/mixes/${mix.id}/audio`)).status).toBe(404)
  })
})

describe('deleting a Mix', () => {
  test('removes the Mix and its files from disk', async () => {
    const { track, take } = await createTrackWithTake()
    const mix = await (await api.requestMix(track.id, take.id, { ...MIX_REQUEST, wav: true })).json()
    writeRenderedFiles(track.id, mix.id, { wav: true })
    api.finishMix(mix.id, mix.jobId, { mp3Path: `mixes/${mix.id}.mp3`, wavPath: `mixes/${mix.id}.wav` })
    const mp3File = join(api.dataDir, 'tracks', track.id, 'mixes', `${mix.id}.mp3`)
    const wavFile = join(api.dataDir, 'tracks', track.id, 'mixes', `${mix.id}.wav`)
    expect(existsSync(mp3File)).toBe(true)
    expect(existsSync(wavFile)).toBe(true)

    const res = await api.del(`/api/tracks/${track.id}/takes/${take.id}/mixes/${mix.id}`)
    expect(res.status).toBe(204)

    expect(existsSync(mp3File)).toBe(false)
    expect(existsSync(wavFile)).toBe(false)
    expect(await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()).toEqual([])
  })

  test('deleting before the render finishes removes the row with no files to clean up', async () => {
    const { track, take } = await createTrackWithTake()
    const mix = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()

    const res = await api.del(`/api/tracks/${track.id}/takes/${take.id}/mixes/${mix.id}`)
    expect(res.status).toBe(204)
  })

  test('deleting an unknown Mix is a 404', async () => {
    const { track, take } = await createTrackWithTake()
    expect((await api.del(`/api/tracks/${track.id}/takes/${take.id}/mixes/nope`)).status).toBe(404)
  })

  test('a Mix id from another Take is a 404, not cross-Take deletable', async () => {
    const { track, take } = await createTrackWithTake()
    const otherTake = await (await api.uploadTake(track.id, TAKE_WAV_BYTES, TAKE_META)).json()
    const mix = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()

    const res = await api.del(`/api/tracks/${track.id}/takes/${otherTake.id}/mixes/${mix.id}`)
    expect(res.status).toBe(404)
    expect(await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()).toHaveLength(1)
  })
})

describe('retrying a Mix', () => {
  test('re-enqueues the same Mix rather than creating a new one', async () => {
    const { track, take } = await createTrackWithTake()
    const mix = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()
    api.finishJob(mix.jobId, 'failed', 'ffmpeg exploded')

    const res = await api.retryMix(track.id, take.id, mix.id)
    expect(res.status).toBe(200)
    const retried = await res.json()

    expect(retried.id).toBe(mix.id)
    expect(retried.jobId).not.toBe(mix.jobId)
    expect(retried.job).toMatchObject({ id: retried.jobId, type: 'render', targetId: mix.id, state: 'queued' })

    const list = await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()
    expect(list).toHaveLength(1)
  })

  test('a Mix whose render has not failed cannot be retried', async () => {
    const { track, take } = await createTrackWithTake()
    const mix = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()

    expect((await api.retryMix(track.id, take.id, mix.id)).status).toBe(409)

    api.finishMix(mix.id, mix.jobId, { mp3Path: `mixes/${mix.id}.mp3` })
    expect((await api.retryMix(track.id, take.id, mix.id)).status).toBe(409)
  })

  test('retrying an unknown Mix is a 404', async () => {
    const { track, take } = await createTrackWithTake()
    expect((await api.retryMix(track.id, take.id, 'nope')).status).toBe(404)
  })
})

describe('re-rendering a Take', () => {
  test('a second request with different gains and pitch creates a new Mix, leaving the first untouched', async () => {
    const { track, take } = await createTrackWithTake()
    const first = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()
    writeRenderedFiles(track.id, first.id, { wav: false })
    api.finishMix(first.id, first.jobId, { mp3Path: `mixes/${first.id}.mp3` })

    const second = await (await api.requestMix(track.id, take.id, {
      ...MIX_REQUEST,
      adjustments: { ...MIX_REQUEST.adjustments, pitchSemitones: -2 },
      vocalGain: 0.5,
    })).json()

    expect(second.id).not.toBe(first.id)
    const list = await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()
    expect(list).toHaveLength(2)
    const reloadedFirst = list.find((m: { id: string }) => m.id === first.id)
    expect(reloadedFirst.mp3Path).toBe(`mixes/${first.id}.mp3`)
    expect(reloadedFirst.pitchSemitones).toBe(MIX_REQUEST.adjustments.pitchSemitones)
  })
})
