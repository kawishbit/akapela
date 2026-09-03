import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

describe('importing an uploaded file as a Track', () => {
  test('a supported upload creates a Track in importing state with a queued import job', async () => {
    const res = await api.upload('/api/tracks', 'Bohemian Rhapsody.mp3', MP3_BYTES)
    expect(res.status).toBe(201)
    const track = await res.json()

    expect(track).toMatchObject({
      title: 'Bohemian Rhapsody',
      artist: null,
      durationMs: null,
      sourceKind: 'upload',
      sourceRef: 'Bohemian Rhapsody.mp3',
      importState: 'importing',
    })
    expect(track.job).toMatchObject({ type: 'import', targetId: track.id, state: 'queued' })

    const job = await (await api.get(`/api/jobs/${track.job.id}`)).json()
    expect(job).toMatchObject({ type: 'import', targetId: track.id, state: 'queued' })
  })

  test('the original file is stored as delivered under the Track directory', async () => {
    const res = await api.upload('/api/tracks', 'take-on-me.FLAC', MP3_BYTES)
    const track = await res.json()

    const stored = readFileSync(join(api.dataDir, 'tracks', track.id, 'original.flac'))
    expect(stored.equals(MP3_BYTES)).toBe(true)
  })

  test('an unsupported file type is rejected with a clear message', async () => {
    const res = await api.upload('/api/tracks', 'notes.txt', Buffer.from('lyrics go here'))
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/mp3, m4a, wav, flac, or ogg/)
    expect(existsSync(join(api.dataDir, 'tracks'))).toBe(false)
  })

  test('a request with no file is rejected', async () => {
    const res = await fetch(api.baseUrl + '/api/tracks', { method: 'POST', body: new FormData() })
    expect(res.status).toBe(400)
  })
})

describe('the library', () => {
  test('lists every Track with its latest job, newest first', async () => {
    const first = await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()
    const second = await (await api.upload('/api/tracks', 'Bohemian Rhapsody.m4a', MP3_BYTES)).json()

    const res = await api.get('/api/tracks')
    expect(res.status).toBe(200)
    const list = await res.json()
    expect(list.map((t: { id: string }) => t.id)).toEqual([second.id, first.id])
    expect(list[0]).toMatchObject({ title: 'Bohemian Rhapsody', importState: 'importing' })
    expect(list[0].job).toMatchObject({ type: 'import', state: 'queued' })
  })

  test('search filters by title or artist, case-insensitively', async () => {
    await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)
    const queen = await (await api.upload('/api/tracks', 'Bohemian Rhapsody.m4a', MP3_BYTES)).json()
    api.setArtist(queen.id, 'Queen')

    const byTitle = await (await api.get('/api/tracks?q=rhap')).json()
    expect(byTitle.map((t: { title: string }) => t.title)).toEqual(['Bohemian Rhapsody'])

    const byArtist = await (await api.get('/api/tracks?q=QUEEN')).json()
    expect(byArtist.map((t: { title: string }) => t.title)).toEqual(['Bohemian Rhapsody'])

    const none = await (await api.get('/api/tracks?q=abba')).json()
    expect(none).toEqual([])
  })

  test('search ignores case beyond ASCII', async () => {
    await api.upload('/api/tracks', 'Jóga.mp3', MP3_BYTES)
    const bjork = await (await api.upload('/api/tracks', 'Army of Me.mp3', MP3_BYTES)).json()
    api.setArtist(bjork.id, 'Björk')

    const byArtist = await (await api.get('/api/tracks?q=BJÖRK')).json()
    expect(byArtist.map((t: { title: string }) => t.title)).toEqual(['Army of Me'])

    const byTitle = await (await api.get('/api/tracks?q=JÓGA')).json()
    expect(byTitle.map((t: { title: string }) => t.title)).toEqual(['Jóga'])
  })

  test('search treats SQL wildcards as plain characters', async () => {
    await api.upload('/api/tracks', '100% Pure Love.mp3', MP3_BYTES)
    await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)

    const percent = await (await api.get('/api/tracks?q=%25')).json()
    expect(percent.map((t: { title: string }) => t.title)).toEqual(['100% Pure Love'])

    const underscore = await (await api.get('/api/tracks?q=_')).json()
    expect(underscore).toEqual([])
  })

  test('a single Track is retrievable with its latest job', async () => {
    const created = await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()

    const res = await api.get(`/api/tracks/${created.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: created.id, title: 'Yesterday', job: { id: created.job.id } })
  })

  test('an unknown Track is a 404', async () => {
    const res = await api.get('/api/tracks/nope')
    expect(res.status).toBe(404)
  })
})

describe('deleting a Track', () => {
  test('removes the Track, its jobs, and its directory from disk', async () => {
    const track = await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()
    const dir = join(api.dataDir, 'tracks', track.id)
    // Stand in for the worker's output.
    writeFileSync(join(dir, 'backing.wav'), 'RIFF')
    expect(existsSync(dir)).toBe(true)

    const res = await api.del(`/api/tracks/${track.id}`)
    expect(res.status).toBe(204)

    expect((await api.get(`/api/tracks/${track.id}`)).status).toBe(404)
    expect((await api.get(`/api/jobs/${track.job.id}`)).status).toBe(404)
    expect(await (await api.get('/api/tracks')).json()).toEqual([])
    expect(existsSync(dir)).toBe(false)
  })

  test('deleting an unknown Track is a 404', async () => {
    expect((await api.del('/api/tracks/nope')).status).toBe(404)
  })
})

describe('retrying a failed import', () => {
  test('puts the Track back into importing state with a fresh queued job', async () => {
    const track = await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()
    api.failImport(track.id, track.job.id, 'ffmpeg: Invalid data found when processing input')

    const before = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(before).toMatchObject({ importState: 'failed', job: { state: 'failed' } })
    expect(before.job.error).toMatch(/Invalid data/)

    const res = await api.post(`/api/tracks/${track.id}/retry`, {})
    expect(res.status).toBe(200)
    const retried = await res.json()
    expect(retried).toMatchObject({ importState: 'importing', job: { type: 'import', state: 'queued' } })
    expect(retried.job.id).not.toBe(track.job.id)
  })

  test('a Track that is not failed cannot be retried', async () => {
    const track = await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()
    const res = await api.post(`/api/tracks/${track.id}/retry`, {})
    expect(res.status).toBe(409)
  })
})

describe("serving a Track's files through the app", () => {
  test('the placeholder cover is served as an image', async () => {
    const track = await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()

    const res = await api.get(`/api/tracks/${track.id}/cover`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/svg+xml')
    const body = await res.text()
    expect(body).toContain('<svg')
    expect(body).toContain('>Y<')
  })

  test('the Backing Track is a 404 until the import has produced it', async () => {
    const track = await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()
    expect((await api.get(`/api/tracks/${track.id}/backing`)).status).toBe(404)
  })

  test('the Backing Track streams whole and by byte range', async () => {
    const track = await (await api.upload('/api/tracks', 'Yesterday.mp3', MP3_BYTES)).json()
    const wav = Buffer.from('RIFF....WAVEfmt data0123456789')
    writeFileSync(join(api.dataDir, 'tracks', track.id, 'backing.wav'), wav)

    const whole = await api.get(`/api/tracks/${track.id}/backing`)
    expect(whole.status).toBe(200)
    expect(whole.headers.get('content-type')).toBe('audio/wav')
    expect(whole.headers.get('accept-ranges')).toBe('bytes')
    expect(whole.headers.get('content-length')).toBe(String(wav.length))
    expect(Buffer.from(await whole.arrayBuffer()).equals(wav)).toBe(true)

    const part = await fetch(`${api.baseUrl}/api/tracks/${track.id}/backing`, {
      headers: { range: 'bytes=4-7' },
    })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe(`bytes 4-7/${wav.length}`)
    expect(part.headers.get('content-length')).toBe('4')
    expect(await part.text()).toBe('....')

    const tail = await fetch(`${api.baseUrl}/api/tracks/${track.id}/backing`, {
      headers: { range: 'bytes=20-' },
    })
    expect(tail.status).toBe(206)
    expect(await tail.text()).toBe('0123456789')

    const beyond = await fetch(`${api.baseUrl}/api/tracks/${track.id}/backing`, {
      headers: { range: `bytes=${wav.length + 5}-` },
    })
    expect(beyond.status).toBe(416)
  })
})
