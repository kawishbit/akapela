import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { QueueEntryWithTrack } from '../../server/lib/queue'
import { createTestApi, type TestApi } from './harness'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

interface TrackBody { id: string, job: { id: string } }

async function importedTrack(url = 'https://youtu.be/dQw4w9WgXcQ'): Promise<TrackBody> {
  const track = await (await api.post('/api/tracks', { url })).json()
  api.finishImport(track.id, track.job.id)
  return track
}

async function queue(): Promise<QueueEntryWithTrack[]> {
  const res = await api.get('/api/queue')
  expect(res.status).toBe(200)
  return res.json()
}

const add = (trackId: string, singerName?: unknown) => api.post('/api/queue', { trackId, singerName })

describe('the Queue', () => {
  test('is empty on a fresh install', async () => {
    expect(await queue()).toEqual([])
  })

  test('appends an entry at the end and returns it', async () => {
    const first = await importedTrack()
    const second = await importedTrack('https://youtu.be/aaaaaaaaaaa')

    const res = await add(first.id, 'Sara')
    expect(res.status).toBe(201)
    const entry = await res.json()
    expect(entry).toMatchObject({ trackId: first.id, singerName: 'Sara', position: 0 })
    await add(second.id)

    const entries = await queue()
    expect(entries.map(e => e.trackId)).toEqual([first.id, second.id])
    expect(entries.map(e => e.position)).toEqual([0, 1])
  })

  test('treats a missing, empty, or blank name as no name, and trims one that is given', async () => {
    const track = await importedTrack()

    for (const name of [undefined, '', '   ', null]) {
      expect((await (await add(track.id, name)).json()).singerName).toBeNull()
    }
    expect((await (await add(track.id, '  Sara  ')).json()).singerName).toBe('Sara')
  })

  test('refuses an unknown Track, and a name that is not text', async () => {
    const track = await importedTrack()

    expect((await add('does-not-exist')).status).toBe(404)
    expect((await add(track.id, 42)).status).toBe(400)
    expect(await queue()).toEqual([])
  })

  test('refuses a Track that has not finished importing', async () => {
    const track = await (await api.post('/api/tracks', { url: 'https://youtu.be/dQw4w9WgXcQ' })).json()

    expect((await add(track.id)).status).toBe(409)
  })

  test('gives two adds at once two different positions', async () => {
    const track = await importedTrack()

    await Promise.all([add(track.id, 'A'), add(track.id, 'B'), add(track.id, 'C')])

    const positions = (await queue()).map(e => e.position)
    expect(new Set(positions).size).toBe(3)
  })

  test('lets the same Track be queued several times, each entry on its own', async () => {
    const track = await importedTrack()
    const first = await (await add(track.id, 'Sara')).json()
    await add(track.id, 'Tom')

    await api.del(`/api/queue/${first.id}`)

    const entries = await queue()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ trackId: track.id, singerName: 'Tom' })
  })

  test('carries what a row needs: the Track, and how its Separation is going', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    api.akapela.sqlite.prepare(`UPDATE jobs SET state = 'running', progress = 42 WHERE id = ?`).run(separationJob.id)
    await add(track.id, 'Sara')

    const [entry] = await queue()

    expect(entry).toMatchObject({
      trackId: track.id,
      singerName: 'Sara',
      track: {
        id: track.id,
        title: expect.any(String),
        artist: null,
        importState: 'ready',
        separationState: 'separating',
        separationProgress: 42,
      },
    })
    expect(entry!.track.updatedAt).toEqual(expect.any(Number))
  })

  test('loses a Track\'s entries when the Track is deleted', async () => {
    const gone = await importedTrack()
    const kept = await importedTrack('https://youtu.be/aaaaaaaaaaa')
    await add(gone.id)
    await add(kept.id)
    await add(gone.id)

    await api.del(`/api/tracks/${gone.id}`)

    expect((await queue()).map(e => e.trackId)).toEqual([kept.id])
  })

  test('removing an entry that is already gone is a clean 404', async () => {
    const track = await importedTrack()
    const entry = await (await add(track.id)).json()
    await api.del(`/api/queue/${entry.id}`)

    expect((await api.del(`/api/queue/${entry.id}`)).status).toBe(404)
  })

  test('clears every entry', async () => {
    const track = await importedTrack()
    await add(track.id)
    await add(track.id)

    const res = await api.post('/api/queue/clear', {})

    expect(res.status).toBe(200)
    expect(await queue()).toEqual([])
    // Appending after a clear starts again from the top.
    expect((await (await add(track.id)).json()).position).toBe(0)
  })
})
