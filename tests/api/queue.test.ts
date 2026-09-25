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

describe('changing an entry in place', () => {
  const move = (id: string, index: unknown) => api.post(`/api/queue/${id}/move`, { index })
  const playNext = (id: string) => api.post(`/api/queue/${id}/play-next`, {})
  const rename = (id: string, singerName: unknown) =>
    fetch(`${api.baseUrl}/api/queue/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ singerName }),
    })

  async function queueOf(names: string[]): Promise<Record<string, string>> {
    const track = await importedTrack()
    const ids: Record<string, string> = {}
    for (const name of names) ids[name] = (await (await add(track.id, name)).json()).id
    return ids
  }

  const order = async () => (await queue()).map(entry => entry.singerName)
  const positions = async () => (await queue()).map(entry => entry.position)

  test('moves the first entry to last and back again', async () => {
    const ids = await queueOf(['A', 'B', 'C', 'D'])

    expect((await move(ids.A!, 3)).status).toBe(200)
    expect(await order()).toEqual(['B', 'C', 'D', 'A'])
    expect(await positions()).toEqual([0, 1, 2, 3])

    await move(ids.A!, 0)
    expect(await order()).toEqual(['A', 'B', 'C', 'D'])
  })

  test('moves an entry into the middle, and clamps an index past either end', async () => {
    const ids = await queueOf(['A', 'B', 'C', 'D'])

    await move(ids.D!, 1)
    expect(await order()).toEqual(['A', 'D', 'B', 'C'])

    await move(ids.A!, 99)
    expect(await order()).toEqual(['D', 'B', 'C', 'A'])

    await move(ids.C!, -5)
    expect(await order()).toEqual(['C', 'D', 'B', 'A'])
  })

  test('keeps a contiguous order with no duplicates after a hundred random moves', async () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F']
    const ids = await queueOf(names)
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647

    for (let i = 0; i < 100; i++) {
      const name = names[Math.floor(random() * names.length)]!
      await move(ids[name]!, Math.floor(random() * names.length))
    }

    expect(await positions()).toEqual([0, 1, 2, 3, 4, 5])
    expect([...(await order())].sort()).toEqual(names)
  })

  test('two moves at once leave a sane order', async () => {
    const ids = await queueOf(['A', 'B', 'C', 'D'])

    await Promise.all([move(ids.A!, 3), move(ids.D!, 0), playNext(ids.C!)])

    expect(await positions()).toEqual([0, 1, 2, 3])
    expect([...(await order())].sort()).toEqual(['A', 'B', 'C', 'D'])
  })

  test('refuses a move without a whole-number index', async () => {
    const ids = await queueOf(['A', 'B'])

    expect((await move(ids.A!, 'last')).status).toBe(400)
    expect((await move(ids.A!, 1.5)).status).toBe(400)
  })

  test('Play next moves an entry to the top', async () => {
    const ids = await queueOf(['A', 'B', 'C'])

    expect((await playNext(ids.C!)).status).toBe(200)

    expect(await order()).toEqual(['C', 'A', 'B'])
  })

  test('renames an entry, and clears a name back to none', async () => {
    const ids = await queueOf(['Sra'])

    expect((await (await rename(ids.Sra!, ' Sara ')).json()).singerName).toBe('Sara')
    expect(await order()).toEqual(['Sara'])

    await rename(ids.Sra!, '')
    expect(await order()).toEqual([null])
  })

  test('moving, promoting, or renaming an entry that is gone is a 404', async () => {
    const ids = await queueOf(['A'])
    await api.del(`/api/queue/${ids.A}`)

    expect((await move(ids.A!, 0)).status).toBe(404)
    expect((await playNext(ids.A!)).status).toBe(404)
    expect((await rename(ids.A!, 'B')).status).toBe(404)
  })
})
