import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'
import { fakeSongMatch } from './fake-lyrics-provider'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

const MP3_BYTES = Buffer.from('ID3 not really an mp3 but the API stores it as delivered')

const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4])

const YESTERDAY = fakeSongMatch('The Beatles', 'Yesterday')
const ON_GENIUS = fakeSongMatch('The Beatles', 'Yesterday', {
  provider: 'genius',
  albumArtUrl: 'https://images.genius.com/help.jpg',
})

async function startImport(filename = 'The Beatles - Yesterday (Karaoke Version).mp3') {
  return (await api.upload('/api/tracks', filename, MP3_BYTES)).json()
}

/** A Track whose import has finished, which is when its cover can be replaced. */
async function importTrack(filename?: string) {
  const track = await startImport(filename)
  api.finishImport(track.id, track.job.id)
  return track
}

function editDetails(trackId: string, body: unknown) {
  return api.put(`/api/tracks/${trackId}/details`, body)
}

function uploadCover(trackId: string, bytes: Uint8Array, filename = 'art.png') {
  const form = new FormData()
  form.append('file', new Blob([bytes]), filename)
  return fetch(`${api.baseUrl}/api/tracks/${trackId}/cover`, { method: 'PUT', body: form })
}

describe("editing a Track's title and artist", () => {
  test('saves both, and the library lists the Track by them', async () => {
    const track = await importTrack()

    const res = await editDetails(track.id, { title: '  Yesterday  ', artist: 'The Beatles' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: track.id, title: 'Yesterday', artist: 'The Beatles' })
    const listed = await (await api.get('/api/tracks')).json()
    expect(listed.find((t: { id: string }) => t.id === track.id)).toMatchObject({ title: 'Yesterday', artist: 'The Beatles' })
  })

  test('a blank artist is saved as no artist', async () => {
    const track = await importTrack()
    await editDetails(track.id, { title: 'Yesterday', artist: 'The Beatles' })

    const edited = await (await editDetails(track.id, { title: 'Yesterday', artist: '   ' })).json()

    expect(edited.artist).toBeNull()
  })

  test.each([
    ['an empty title', { title: '   ', artist: 'The Beatles' }],
    ['no title at all', { artist: 'The Beatles' }],
    ['a title that is not text', { title: 42, artist: null }],
    ['a title longer than any real one', { title: 'x'.repeat(301), artist: null }],
    ['an artist that is not text', { title: 'Yesterday', artist: 7 }],
  ])('%s is refused and changes nothing', async (_case, body) => {
    const track = await importTrack()

    const res = await editDetails(track.id, body)

    expect(res.status).toBe(400)
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).title).toBe(track.title)
  })

  test('leaves the confirmed Song and its Lyrics alone', async () => {
    api.lyrics.lyrics = { yesterday: { kind: 'plain', lines: [{ text: 'Yesterday' }] } }
    const track = await importTrack()
    await api.confirmSong(track.id, YESTERDAY)

    await editDetails(track.id, { title: 'My favourite', artist: 'Someone else' })

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened).toMatchObject({
      title: 'My favourite',
      artist: 'Someone else',
      songArtist: 'The Beatles',
      songTitle: 'Yesterday',
      lyricsProvider: 'lrclib',
      lyrics: { kind: 'plain' },
    })
  })

  test('an artist the singer typed survives confirming a Song afterwards', async () => {
    const track = await importTrack()
    await editDetails(track.id, { title: track.title, artist: 'Beatles, The' })

    const confirmed = await (await api.confirmSong(track.id, YESTERDAY)).json()

    expect(confirmed).toMatchObject({ artist: 'Beatles, The', songArtist: 'The Beatles' })
  })

  test('saving the artist unchanged still lets a Song fill it in later', async () => {
    const track = await importTrack()
    await editDetails(track.id, { title: 'Yesterday', artist: null })

    const confirmed = await (await api.confirmSong(track.id, YESTERDAY)).json()

    expect(confirmed.artist).toBe('The Beatles')
  })

  test('the placeholder cover follows the new title', async () => {
    const track = await importTrack('zzz.mp3')

    await editDetails(track.id, { title: 'Yesterday', artist: null })

    const svg = readFileSync(join(api.dataDir, 'tracks', track.id, 'cover.svg'), 'utf8')
    expect(svg).toContain('>Y</text>')
  })

  test('editing an unknown Track is a 404', async () => {
    expect((await editDetails('no-such-track', { title: 'x', artist: null })).status).toBe(404)
  })
})

describe("replacing a Track's cover art", () => {
  test('an uploaded image becomes the cover, leaving one cover file behind', async () => {
    const track = await importTrack()

    const res = await uploadCover(track.id, PNG)

    expect(res.status).toBe(200)
    const edited = await res.json()
    expect(edited.coverPath).toBe('cover.png')
    expect(edited.updatedAt).toBeGreaterThanOrEqual(track.updatedAt)
    const cover = await api.get(`/api/tracks/${track.id}/cover`)
    expect(cover.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await cover.arrayBuffer())).toEqual(PNG)
    expect(existsSync(join(api.dataDir, 'tracks', track.id, 'cover.svg'))).toBe(false)
  })

  test.each([
    ['a file that is not an image', new TextEncoder().encode('<html></html>')],
    ['an SVG', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['an image too large to be cover art', (() => {
      const big = new Uint8Array(8 * 1024 * 1024 + 1)
      big.set(PNG)
      return big
    })()],
  ])('%s is refused and the cover is kept', async (_case, bytes) => {
    const track = await importTrack()

    const res = await uploadCover(track.id, bytes)

    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/PNG, JPEG, or WebP|too large/)
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).coverPath).toBe('cover.svg')
    expect(existsSync(join(api.dataDir, 'tracks', track.id, 'cover.svg'))).toBe(true)
  })

  test('a request with no file is refused', async () => {
    const track = await importTrack()
    const res = await fetch(`${api.baseUrl}/api/tracks/${track.id}/cover`, { method: 'PUT', body: new FormData() })
    expect(res.status).toBe(400)
  })

  test('a cover the singer uploaded is not replaced by the album art of a Song confirmed later', async () => {
    const track = await importTrack()
    await api.post(`/api/tracks/${track.id}/lyrics`, { provider: 'genius' })
    await uploadCover(track.id, PNG)

    const confirmed = await (await api.confirmSong(track.id, ON_GENIUS)).json()

    expect(api.images.requested).toEqual([])
    expect(confirmed.coverPath).toBe('cover.png')
  })

  test('a new title leaves an uploaded cover alone', async () => {
    const track = await importTrack()
    await uploadCover(track.id, PNG)

    await editDetails(track.id, { title: 'Yesterday', artist: null })

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).coverPath).toBe('cover.png')
  })

  test('is refused while the Track is still importing, since the import writes the Source artwork', async () => {
    const track = await startImport()

    const res = await uploadCover(track.id, PNG)

    expect(res.status).toBe(409)
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).coverPath).toBe('cover.svg')
  })

  test('uploading to an unknown Track is a 404', async () => {
    expect((await uploadCover('no-such-track', PNG)).status).toBe(404)
  })
})
