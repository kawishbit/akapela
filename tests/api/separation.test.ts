import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

/** A Track whose import has finished, which is the only kind that can be separated. */
async function importedTrack() {
  const track = await (await api.post('/api/tracks', { url: 'https://youtu.be/dQw4w9WgXcQ' })).json()
  api.finishImport(track.id, track.job.id)
  return track
}

describe('asking for a Track to be separated', () => {
  test('a fresh Track has not been separated and has no separate Job', async () => {
    const track = await importedTrack()

    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.separationState).toBe('none')
    expect(detail.separationJob).toBeNull()
  })

  test('a separate request enqueues a separate Job and moves the Track to separating', async () => {
    const track = await importedTrack()

    const res = await api.post(`/api/tracks/${track.id}/separate`, {})
    expect(res.status).toBe(200)
    const separating = await res.json()
    expect(separating.separationState).toBe('separating')
    expect(separating.separationJob).toMatchObject({
      type: 'separate',
      targetId: track.id,
      state: 'queued',
      progress: 0,
    })

    const job = await (await api.get(`/api/jobs/${separating.separationJob.id}`)).json()
    expect(job).toMatchObject({ type: 'separate', targetId: track.id, state: 'queued' })
  })

  test('the separation state and the separate Job are on the Track detail response', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()

    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.separationState).toBe('separating')
    expect(detail.separationJob).toMatchObject({ id: separationJob.id, type: 'separate', state: 'queued' })
  })

  test('a Track already separating is rejected rather than queueing a second Job', async () => {
    const track = await importedTrack()
    await api.post(`/api/tracks/${track.id}/separate`, {})

    const res = await api.post(`/api/tracks/${track.id}/separate`, {})
    expect(res.status).toBe(409)
    expect(res.statusText).toMatch(/already separating/i)
    expect(api.jobsTargeting(track.id, 'separate')).toHaveLength(1)
  })

  test('a Track whose import has not finished cannot be separated', async () => {
    const track = await (await api.post('/api/tracks', { url: 'https://youtu.be/dQw4w9WgXcQ' })).json()

    const res = await api.post(`/api/tracks/${track.id}/separate`, {})
    expect(res.status).toBe(409)
    expect(res.statusText).toMatch(/imported/i)
    expect(api.jobsTargeting(track.id, 'separate')).toHaveLength(0)
  })

  test('an unknown Track is a 404', async () => {
    expect((await api.post('/api/tracks/does-not-exist/separate', {})).status).toBe(404)
  })

  test('a Track that already has Stems can be separated again', async () => {
    const track = await importedTrack()
    const first = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    api.finishSeparation(track.id, first.separationJob.id, 'succeeded')

    const res = await api.post(`/api/tracks/${track.id}/separate`, {})
    expect(res.status).toBe(200)
    const again = await res.json()
    expect(again.separationState).toBe('separating')
    expect(again.separationJob.id).not.toBe(first.separationJob.id)
  })
})

describe('retrying a failed separation', () => {
  test('a failed separation is re-enqueued on the same Track', async () => {
    const track = await importedTrack()
    const started = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    api.finishSeparation(track.id, started.separationJob.id, 'failed', 'SeparationError: no network')

    const failed = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(failed.separationState).toBe('failed')
    expect(failed.separationJob.error).toContain('no network')

    const res = await api.post(`/api/tracks/${track.id}/separate/retry`, {})
    expect(res.status).toBe(200)
    const retried = await res.json()
    expect(retried).toMatchObject({
      id: track.id,
      separationState: 'separating',
      separationJob: { type: 'separate', targetId: track.id, state: 'queued', error: null },
    })
    expect(retried.separationJob.id).not.toBe(started.separationJob.id)
  })

  test('only a failed separation can be retried', async () => {
    const track = await importedTrack()

    const never = await api.post(`/api/tracks/${track.id}/separate/retry`, {})
    expect(never.status).toBe(409)
    expect(never.statusText).toMatch(/failed separation/i)

    await api.post(`/api/tracks/${track.id}/separate`, {})
    const running = await api.post(`/api/tracks/${track.id}/separate/retry`, {})
    expect(running.status).toBe(409)
    expect(api.jobsTargeting(track.id, 'separate')).toHaveLength(1)
  })

  test('an unknown Track is a 404', async () => {
    expect((await api.post('/api/tracks/does-not-exist/separate/retry', {})).status).toBe(404)
  })
})

describe('the Track through a separation', () => {
  test('a succeeded separation leaves the Track ready and a failed one failed', async () => {
    const track = await importedTrack()
    const started = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()

    api.finishSeparation(track.id, started.separationJob.id, 'succeeded')
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).separationState).toBe('ready')

    const again = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    api.finishSeparation(track.id, again.separationJob.id, 'failed', 'SeparationError: the model refused this audio')
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).separationState).toBe('failed')
  })

  test('the import Job stays the Track\'s Job once a separation has been enqueued', async () => {
    const track = await importedTrack()
    await api.post(`/api/tracks/${track.id}/separate`, {})

    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.job).toMatchObject({ id: track.job.id, type: 'import' })
    expect((await (await api.get('/api/tracks')).json())[0].job).toMatchObject({ type: 'import' })
  })

  test('deleting a Track takes its separate Job with it', async () => {
    const track = await importedTrack()
    const started = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()

    expect((await api.del(`/api/tracks/${track.id}`)).status).toBe(204)

    expect((await api.get(`/api/jobs/${started.separationJob.id}`)).status).toBe(404)
  })
})
