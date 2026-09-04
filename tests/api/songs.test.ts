import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { LyricsProviderError } from '../../server/lyrics/provider'
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

/** Imports a Track whose title is the filename, which is what the guesser reads. */
async function importTrack(filename = 'The Beatles - Yesterday (Karaoke Version).mp3') {
  return (await api.upload('/api/tracks', filename, MP3_BYTES)).json()
}

const YESTERDAY = fakeSongMatch('The Beatles', 'Yesterday', { album: 'Help!', durationMs: 125_000 })

const SYNCED = {
  kind: 'synced' as const,
  lines: [
    { text: 'Yesterday', atMs: 12_340 },
    { text: 'All my troubles seemed so far away', atMs: 15_000 },
  ],
}

describe('searching for the Song a Track represents', () => {
  test('guesses the artist and title from the Track title and returns the matches', async () => {
    api.lyrics.songs = [YESTERDAY]
    const track = await importTrack()

    const res = await api.get(`/api/tracks/${track.id}/songs`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      artist: 'The Beatles',
      title: 'Yesterday',
      matches: [YESTERDAY],
    })
  })

  test('tries the other reading of the title when the first finds nothing', async () => {
    api.lyrics.songs = [YESTERDAY]
    const track = await importTrack('Yesterday - The Beatles.mp3')

    const found = await (await api.get(`/api/tracks/${track.id}/songs`)).json()

    expect(found).toMatchObject({ artist: 'The Beatles', title: 'Yesterday', matches: [YESTERDAY] })
  })

  test('searches for what the singer typed instead of the guess', async () => {
    api.lyrics.songs = [YESTERDAY]
    const track = await importTrack('some_file_name.mp3')

    const found = await (await api.get(
      `/api/tracks/${track.id}/songs?artist=${encodeURIComponent('The Beatles')}&title=Yesterday`,
    )).json()

    expect(found).toMatchObject({ artist: 'The Beatles', title: 'Yesterday', matches: [YESTERDAY] })
  })

  test('a Song nobody recognises comes back as the guess with no matches', async () => {
    const track = await importTrack()

    expect(await (await api.get(`/api/tracks/${track.id}/songs`)).json()).toEqual({
      artist: 'The Beatles',
      title: 'Yesterday',
      matches: [],
    })
  })

  test('a Lyrics Provider that cannot be reached is reported rather than shown as no matches', async () => {
    api.lyrics.searchError = new LyricsProviderError('lrclib', 'HTTP 503')
    const track = await importTrack()

    const res = await api.get(`/api/tracks/${track.id}/songs`)
    expect(res.status).toBe(502)
    expect(res.statusText).toMatch(/lrclib could not be reached/)
  })

  test('searching an unknown Track is a 404', async () => {
    expect((await api.get('/api/tracks/nope/songs')).status).toBe(404)
  })
})

describe('confirming the Song a Track represents', () => {
  test('stores the Song, fetches its Lyrics, and lists the Track by its artist', async () => {
    api.lyrics.lyrics = { yesterday: SYNCED }
    const track = await importTrack()

    const res = await api.confirmSong(track.id, YESTERDAY)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: track.id,
      artist: 'The Beatles',
      songArtist: 'The Beatles',
      songTitle: 'Yesterday',
      lyrics: { provider: 'lrclib', kind: 'synced', lines: SYNCED.lines },
    })

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened).toMatchObject({ songTitle: 'Yesterday', lyrics: { kind: 'synced' } })
    expect(reopened.lyrics.lines).toEqual(SYNCED.lines)
  })

  test('keeps the provider ids so the Lyrics can be fetched again', async () => {
    api.lyrics.lyrics = { yesterday: SYNCED }
    const track = await importTrack()

    await api.put(`/api/tracks/${track.id}/song`, YESTERDAY)

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened.songProviderIds).toEqual(YESTERDAY.providerIds)
  })

  test('a Song typed by hand is confirmed the same way, with no provider ids', async () => {
    api.lyrics.lyrics = { 'army of me': { kind: 'plain', lines: [{ text: 'Stand up' }] } }
    const track = await importTrack('some_file_name.mp3')

    const confirmed = await (await api.confirmSong(track.id, { artist: 'Björk', title: 'Army of Me' })).json()

    expect(confirmed).toMatchObject({
      songArtist: 'Björk',
      songTitle: 'Army of Me',
      songProviderIds: {},
      lyrics: { kind: 'plain', lines: [{ text: 'Stand up' }] },
    })
  })

  test('a Song with no Lyrics anywhere is still confirmed, with none attached', async () => {
    const track = await importTrack()

    const confirmed = await (await api.confirmSong(track.id, YESTERDAY)).json()

    expect(confirmed).toMatchObject({ songTitle: 'Yesterday', lyrics: null })
  })

  test('changing the Song later replaces the Lyrics of the one before', async () => {
    api.lyrics.lyrics = {
      'yesterday': SYNCED,
      'army of me': { kind: 'plain', lines: [{ text: 'Stand up' }] },
    }
    const track = await importTrack()
    await api.confirmSong(track.id, YESTERDAY)

    const changed = await (await api.confirmSong(track.id, { artist: 'Björk', title: 'Army of Me' })).json()

    expect(changed).toMatchObject({
      songTitle: 'Army of Me',
      lyrics: { kind: 'plain', lines: [{ text: 'Stand up' }] },
    })
  })

  test('changing to a Song with no Lyrics clears the words of the one before', async () => {
    api.lyrics.lyrics = { yesterday: SYNCED }
    const track = await importTrack()
    await api.confirmSong(track.id, YESTERDAY)

    await api.confirmSong(track.id, { artist: 'Nobody', title: 'Unknown' })

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).lyrics).toBeNull()
  })

  test('a Lyrics Provider that cannot be reached confirms the Song and says why the Lyrics are missing', async () => {
    api.lyrics.fetchError = new LyricsProviderError('lrclib', 'HTTP 503')
    const track = await importTrack()

    const confirmed = await (await api.confirmSong(track.id, YESTERDAY)).json()

    expect(confirmed).toMatchObject({ songTitle: 'Yesterday', lyrics: null })
    expect(confirmed.lyricsError).toMatch(/lrclib could not be reached/)
  })

  test('a Song changed while the provider is down does not keep the words of the one before', async () => {
    api.lyrics.lyrics = { yesterday: SYNCED }
    const track = await importTrack()
    await api.confirmSong(track.id, YESTERDAY)

    api.lyrics.fetchError = new LyricsProviderError('lrclib', 'HTTP 503')
    const changed = await (await api.confirmSong(track.id, { artist: 'Björk', title: 'Army of Me' })).json()

    expect(changed).toMatchObject({ songTitle: 'Army of Me', lyrics: null })
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).lyrics).toBeNull()
  })

  test.each([
    { artist: 'The Beatles' },
    { title: 'Yesterday' },
    { artist: '', title: 'Yesterday' },
    { artist: 'The Beatles', title: '   ' },
    { artist: 'The Beatles', title: 'x'.repeat(301) },
    { artist: 42, title: 'Yesterday' },
    'The Beatles - Yesterday',
  ])('%j is rejected and confirms nothing', async (body) => {
    const track = await importTrack()

    const res = await api.put(`/api/tracks/${track.id}/song`, body)
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/A Song needs an artist and a title/)

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).songTitle).toBeNull()
  })

  test('confirming a Song on an unknown Track is a 404', async () => {
    expect((await api.confirmSong('nope', YESTERDAY)).status).toBe(404)
  })

  test('deleting the Track takes its Lyrics with it', async () => {
    api.lyrics.lyrics = { yesterday: SYNCED }
    const track = await importTrack()
    await api.confirmSong(track.id, YESTERDAY)

    await api.del(`/api/tracks/${track.id}`)

    expect(api.presto.sqlite.prepare('SELECT count(*) AS n FROM lyrics').get()).toEqual({ n: 0 })
  })

  test('a Track with no confirmed Song has none and no Lyrics', async () => {
    const track = await importTrack()

    expect(await (await api.get(`/api/tracks/${track.id}`)).json()).toMatchObject({
      songArtist: null,
      songTitle: null,
      songProviderIds: null,
      lyricsOffsetMs: 0,
      lyrics: null,
    })
  })
})

describe("a Track's Lyrics Offset", () => {
  test('is saved in tenths of a second and comes back when the Track is opened again', async () => {
    const track = await importTrack()

    const res = await api.put(`/api/tracks/${track.id}/lyrics-offset`, { offsetMs: -1_500 })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: track.id, lyricsOffsetMs: -1_500 })

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).lyricsOffsetMs).toBe(-1_500)
  })

  test('survives fetching the Lyrics again, because it corrects the Backing Track and not the words', async () => {
    api.lyrics.lyrics = { yesterday: SYNCED }
    const track = await importTrack()
    await api.put(`/api/tracks/${track.id}/lyrics-offset`, { offsetMs: 2_000 })

    await api.confirmSong(track.id, YESTERDAY)

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).lyricsOffsetMs).toBe(2_000)
  })

  test.each([{ offsetMs: 250 }, { offsetMs: 30_100 }, { offsetMs: -30_100 }, { offsetMs: '300' }, { offsetMs: 1.5 }, {}])(
    '%j is rejected and leaves the saved Lyrics Offset alone',
    async (body) => {
      const track = await importTrack()
      await api.put(`/api/tracks/${track.id}/lyrics-offset`, { offsetMs: 700 })

      const res = await api.put(`/api/tracks/${track.id}/lyrics-offset`, body)
      expect(res.status).toBe(400)
      expect(res.statusText).toMatch(/whole tenth of a second/)

      expect((await (await api.get(`/api/tracks/${track.id}`)).json()).lyricsOffsetMs).toBe(700)
    },
  )

  test('saving a Lyrics Offset on an unknown Track is a 404', async () => {
    expect((await api.put('/api/tracks/nope/lyrics-offset', { offsetMs: 0 })).status).toBe(404)
  })
})
