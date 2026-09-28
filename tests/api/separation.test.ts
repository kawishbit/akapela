import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

  test('the Library names the separate Job, so a card can link to its row on the Jobs page', async () => {
    const track = await importedTrack()
    expect((await (await api.get('/api/tracks')).json())[0].separationJobId).toBeNull()

    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()

    const [listed] = await (await api.get('/api/tracks')).json()
    expect(listed.separationJobId).toBe(separationJob.id)
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

describe('the Separation Model', () => {
  /** A Track with Stems on disk, the way a finished Separation leaves it. */
  async function separatedTrack(separationModel?: string) {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, { separationModel })).json()
    writeFileSync(join(api.dataDir, 'tracks', track.id, 'instrumental.wav'), 'the instrumental')
    api.finishSeparation(track.id, separationJob.id, 'succeeded')
    return track
  }

  test('is the default when a Separation names none', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    expect(separationJob.separationModel).toBe('Inst_Main')
  })

  test('is the one a Separation names', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, { separationModel: 'Inst_HQ_3' })).json()
    expect(separationJob.separationModel).toBe('Inst_HQ_3')
  })

  test('refuses one that is not in the catalog, and queues nothing', async () => {
    const track = await importedTrack()
    const res = await api.post(`/api/tracks/${track.id}/separate`, { separationModel: 'Roformer' })
    expect(res.status).toBe(400)
    expect(api.jobsTargeting(track.id, 'separate')).toEqual([])
  })

  test('is fixed when asked for: changing the default leaves a queued Separation alone', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()

    await api.put('/api/settings', { separationModel: 'Inst_HQ_4' })

    const job = await (await api.get(`/api/jobs/${separationJob.id}`)).json()
    expect(job.separationModel).toBe('Inst_Main')
    const [row] = (await (await api.get('/api/jobs')).json()).filter((j: { id: string }) => j.id === separationJob.id)
    expect(row.separationModel).toBe('Inst_Main')
  })

  test('a new default applies to the next Separation asked for', async () => {
    await api.put('/api/settings', { separationModel: 'Kim_Vocal_2' })
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    expect(separationJob.separationModel).toBe('Kim_Vocal_2')
  })

  test('is recorded with the Stems it made', async () => {
    const track = await separatedTrack('Inst_HQ_3')
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).stemsModel).toBe('Inst_HQ_3')
  })

  test('reads as Inst_Main for Stems made before there was a choice', async () => {
    const track = await separatedTrack()
    api.akapela.sqlite.prepare(`UPDATE tracks SET stems_model = NULL WHERE id = ?`).run(track.id)
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).stemsModel).toBe('Inst_Main')
  })

  test('is nothing once the Stems are deleted', async () => {
    const track = await separatedTrack('Inst_HQ_4')
    await api.del(`/api/tracks/${track.id}/stems`)
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).stemsModel).toBeNull()
  })

  test('a retried Separation keeps the model it was asked for', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, { separationModel: 'Inst_HQ_3' })).json()
    api.finishSeparation(track.id, separationJob.id, 'failed', 'Error: no network')
    await api.put('/api/settings', { separationModel: 'Inst_HQ_4' })

    const retried = await (await api.post(`/api/jobs/${separationJob.id}/retry`, {})).json()
    expect(retried.separationModel).toBe('Inst_HQ_3')
  })

  test('is a setting, Inst_Main when never set, with every model on offer', async () => {
    const settings = await (await api.get('/api/settings')).json()
    expect(settings.separationModel).toBe('Inst_Main')
    expect(settings.separationModels.map((m: { name: string }) => m.name))
      .toEqual(['Inst_Main', 'Inst_HQ_3', 'Inst_HQ_4', 'Kim_Vocal_2'])
    expect((await api.put('/api/settings', { separationModel: 'nope' })).status).toBe(400)
  })
})
