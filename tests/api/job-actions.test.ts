import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { JobListEntry } from '../../server/lib/job-actions'
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
const TAKE_META = {
  startPositionMs: 12_000,
  durationMs: 8_000,
  adjustments: { pitchSemitones: 0, tempoPercent: 100, linked: true },
  backingSource: 'original',
}
const MIX_REQUEST = {
  adjustments: { pitchSemitones: 0, tempoPercent: 100, linked: true },
  backingSource: 'original',
  latencyNudgeMs: 0,
  vocalGain: 1,
  backingGain: 1,
  wav: false,
}

interface TrackBody { id: string, job: { id: string } }

async function importingTrack(): Promise<TrackBody> {
  return (await api.post('/api/tracks', { url: 'https://youtu.be/dQw4w9WgXcQ' })).json()
}

async function importedTrack(): Promise<TrackBody> {
  const track = await importingTrack()
  api.finishImport(track.id, track.job.id)
  return track
}

function trackDir(trackId: string): string {
  return join(api.dataDir, 'tracks', trackId)
}

/** Puts Stems on disk the way a finished Separation leaves them. */
async function separatedTrack(): Promise<TrackBody> {
  const track = await importedTrack()
  const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
  mkdirSync(trackDir(track.id), { recursive: true })
  writeFileSync(join(trackDir(track.id), 'instrumental.wav'), 'the old instrumental')
  writeFileSync(join(trackDir(track.id), 'vocals.wav'), 'the old vocals')
  api.finishSeparation(track.id, separationJob.id, 'succeeded')
  return track
}

async function trackWithMix() {
  const track = (await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()) as TrackBody
  api.finishImport(track.id, track.job.id)
  const take = await (await api.uploadTake(track.id, TAKE_WAV_BYTES, TAKE_META)).json()
  const mix = await (await api.requestMix(track.id, take.id, MIX_REQUEST)).json()
  return { track, take, mix }
}

const cancel = (jobId: string) => api.post(`/api/jobs/${jobId}/cancel`, {})
const retry = (jobId: string) => api.post(`/api/jobs/${jobId}/retry`, {})
const clear = () => api.post('/api/jobs/clear', {})

async function listJobs(): Promise<JobListEntry[]> {
  const res = await api.get('/api/jobs')
  expect(res.status).toBe(200)
  return res.json()
}

async function jobState(jobId: string) {
  return (await (await api.get(`/api/jobs/${jobId}`)).json()).state
}

describe('cancelling a queued Job', () => {
  test('a first Separation leaves the Track as if it was never asked for', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()

    const res = await cancel(separationJob.id)

    expect(res.status).toBe(200)
    expect(await jobState(separationJob.id)).toBe('cancelled')
    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.separationState).toBe('none')
    expect(detail.backingSource).toBe('original')
    expect(detail.hasStems).toBe(false)
  })

  test('a re-separation leaves the Track ready, with the Stems it already had', async () => {
    const track = await separatedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()

    await cancel(separationJob.id)

    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.separationState).toBe('ready')
    expect(detail.backingSource).toBe('instrumental')
    expect(readFileSync(join(trackDir(track.id), 'instrumental.wav'), 'utf8')).toBe('the old instrumental')
  })

  test('an import deletes its Track, rows and directory, but keeps the cancelled Job', async () => {
    const track = await importingTrack()
    expect(existsSync(trackDir(track.id))).toBe(true)

    await cancel(track.job.id)

    expect((await api.get(`/api/tracks/${track.id}`)).status).toBe(404)
    expect(existsSync(trackDir(track.id))).toBe(false)
    expect(await jobState(track.job.id)).toBe('cancelled')
  })

  test('a Mix deletes the Mix row and leaves its Take alone', async () => {
    const { track, take, mix } = await trackWithMix()

    await cancel(mix.job.id)

    expect(await jobState(mix.job.id)).toBe('cancelled')
    const mixes = await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()
    expect(mixes).toEqual([])
    const takes = await (await api.get(`/api/tracks/${track.id}/takes`)).json()
    expect(takes.map((t: { id: string }) => t.id)).toEqual([take.id])
  })

  test('a finished Job is left alone, and the answer says why', async () => {
    const track = await importingTrack()
    api.finishImport(track.id, track.job.id)

    const res = await cancel(track.job.id)

    expect(res.status).toBe(409)
    expect(res.statusText).toMatch(/finished/i)
    expect(await jobState(track.job.id)).toBe('succeeded')
    expect((await api.get(`/api/tracks/${track.id}`)).status).toBe(200)
  })

  test('an unknown Job is a 404', async () => {
    expect((await cancel('does-not-exist')).status).toBe(404)
  })
})

describe('retrying a failed Job', () => {
  test('a failed import gets a new Job, and the failed one keeps its error', async () => {
    const track = await importingTrack()
    api.failImport(track.id, track.job.id, 'yt-dlp exploded')

    const res = await retry(track.job.id)

    expect(res.status).toBe(200)
    const retried = await res.json()
    expect(retried.id).not.toBe(track.job.id)
    expect(retried).toMatchObject({ type: 'import', targetId: track.id, state: 'queued' })
    const old = await (await api.get(`/api/jobs/${track.job.id}`)).json()
    expect(old).toMatchObject({ state: 'failed', error: 'yt-dlp exploded' })
    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.importState).toBe('importing')
  })

  test('a failed Separation is asked for again', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    api.finishSeparation(track.id, separationJob.id, 'failed', 'out of memory')

    const retried = await (await retry(separationJob.id)).json()

    expect(retried).toMatchObject({ type: 'separate', targetId: track.id, state: 'queued' })
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).separationState).toBe('separating')
  })

  test('a failed Mix is rendered again on the same Mix', async () => {
    const { track, take, mix } = await trackWithMix()
    api.finishJob(mix.job.id, 'failed', 'ffmpeg exploded')

    const retried = await (await retry(mix.job.id)).json()

    expect(retried).toMatchObject({ type: 'render', targetId: mix.id, state: 'queued' })
    const [listed] = await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()
    expect(listed.jobId).toBe(retried.id)
  })

  test('only a failed Job can be retried', async () => {
    const track = await importingTrack()

    const res = await retry(track.job.id)

    expect(res.status).toBe(409)
    expect(api.jobsTargeting(track.id, 'import')).toHaveLength(1)
  })

  test('a failure that has already been retried is not retried twice', async () => {
    const track = await importingTrack()
    api.failImport(track.id, track.job.id, 'yt-dlp exploded')
    await retry(track.job.id)

    const res = await retry(track.job.id)

    expect(res.status).toBe(409)
    expect(api.jobsTargeting(track.id, 'import')).toHaveLength(2)
  })
})

describe('clearing finished Jobs', () => {
  test('removes succeeded and cancelled Jobs, and a failure that has been retried', async () => {
    const done = await importingTrack()
    api.finishImport(done.id, done.job.id)
    const gone = await importingTrack()
    await cancel(gone.job.id)
    const retried = await importingTrack()
    api.failImport(retried.id, retried.job.id, 'first try failed')
    const replacement = await (await retry(retried.job.id)).json()

    const res = await clear()

    expect(res.status).toBe(200)
    expect((await api.get(`/api/jobs/${done.job.id}`)).status).toBe(404)
    expect((await api.get(`/api/jobs/${gone.job.id}`)).status).toBe(404)
    expect((await api.get(`/api/jobs/${retried.job.id}`)).status).toBe(404)
    expect(await jobState(replacement.id)).toBe('queued')
  })

  test('keeps a failure that is still the latest word on its Track', async () => {
    const track = await importingTrack()
    api.failImport(track.id, track.job.id, 'yt-dlp exploded')

    await clear()

    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.job).toMatchObject({ id: track.job.id, error: 'yt-dlp exploded' })
  })

  test('leaves queued and running Jobs alone', async () => {
    const track = await importingTrack()

    await clear()

    expect(await jobState(track.job.id)).toBe('queued')
  })
})

describe('listing Jobs', () => {
  test('names each Job by its Track, and a Mix by its Take', async () => {
    const { track, take, mix } = await trackWithMix()

    const jobs = await listJobs()

    const render = jobs.find(job => job.id === mix.job.id)
    expect(render).toMatchObject({
      type: 'render',
      state: 'queued',
      lane: 'light',
      track: { id: track.id, title: 'Yesterday' },
      take: { id: take.id, number: 1, createdAt: take.createdAt },
    })
    const imported = jobs.find(job => job.id === track.job.id)
    expect(imported).toMatchObject({ type: 'import', track: { id: track.id }, take: null })
  })

  test('says which Lane a Separation waits in', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()

    const jobs = await listJobs()

    expect(jobs.find(job => job.id === separationJob.id)).toMatchObject({ lane: 'heavy', track: { id: track.id } })
  })

  test('shows only the latest Job per target and type, so a retried failure drops out', async () => {
    const track = await importingTrack()
    api.failImport(track.id, track.job.id, 'yt-dlp exploded')
    const replacement = await (await retry(track.job.id)).json()

    const ids = (await listJobs()).map(job => job.id)

    expect(ids).toContain(replacement.id)
    expect(ids).not.toContain(track.job.id)
  })

  test('still lists a cancelled import whose Track is gone', async () => {
    const track = await importingTrack()
    await cancel(track.job.id)

    const jobs = await listJobs()

    expect(jobs.find(job => job.id === track.job.id)).toMatchObject({ state: 'cancelled', track: null })
  })

  test('is empty on a quiet install', async () => {
    expect(await listJobs()).toEqual([])
  })
})
