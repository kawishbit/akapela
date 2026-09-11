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

async function importTrack(filename = 'The Beatles - Yesterday (Karaoke Version).mp3') {
  return (await api.upload('/api/tracks', filename, MP3_BYTES)).json()
}

const ALBUM_ART = 'https://images.genius.com/help.jpg'

/** The same Song as each provider knows it: LRCLIB has timings, Genius has the album art. */
const ON_LRCLIB = fakeSongMatch('The Beatles', 'Yesterday', { album: 'Help!', durationMs: 125_000 })
const ON_GENIUS = fakeSongMatch('The Beatles', 'Yesterday', {
  provider: 'genius',
  album: 'Help!',
  albumArtUrl: ALBUM_ART,
})

const SYNCED = {
  kind: 'synced' as const,
  lines: [{ text: 'Yesterday', atMs: 12_340 }, { text: 'All my troubles', atMs: 15_000 }],
}

const FROM_GENIUS = {
  kind: 'plain' as const,
  lines: [{ text: 'Yesterday' }, { text: 'All my troubles seemed so far away' }],
}

const PASTED = 'Yesterday\nAll my troubles seemed so far away\n\nSuddenly'

/** Puts a Track on a Lyrics Provider, which is what the picker on the Track page does. */
function pickProvider(trackId: string, provider: string, overwriteManual?: boolean) {
  return api.post(`/api/tracks/${trackId}/lyrics`, { provider, overwriteManual })
}

describe('choosing where a Track gets its Lyrics', () => {
  test('a new Track starts on the default provider, and Tracks already imported keep theirs', async () => {
    const first = await importTrack()
    expect(first.lyricsProvider).toBe('lrclib')

    await api.put('/api/settings', { defaultLyricsProvider: 'genius' })
    const second = await importTrack('Björk - Army of Me.mp3')

    expect(second.lyricsProvider).toBe('genius')
    expect((await (await api.get(`/api/tracks/${first.id}`)).json()).lyricsProvider).toBe('lrclib')
  })

  test('picking a provider fetches the confirmed Song from it and remembers the choice', async () => {
    api.lyrics.lyrics = { yesterday: SYNCED }
    api.genius.lyrics = { yesterday: FROM_GENIUS }
    const track = await importTrack()
    await api.confirmSong(track.id, ON_LRCLIB)

    const res = await pickProvider(track.id, 'genius')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      lyricsProvider: 'genius',
      lyrics: { provider: 'genius', kind: 'plain', lines: FROM_GENIUS.lines },
    })

    const reopened = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(reopened).toMatchObject({ lyricsProvider: 'genius', lyrics: { provider: 'genius' } })
  })

  test('asking again with no provider refetches from the one the Track is on', async () => {
    const track = await importTrack()
    await api.confirmSong(track.id, ON_LRCLIB)
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).lyrics).toBeNull()

    api.lyrics.lyrics = { yesterday: SYNCED }
    const refetched = await (await api.post(`/api/tracks/${track.id}/lyrics`, {})).json()

    expect(refetched).toMatchObject({ lyricsProvider: 'lrclib', lyrics: { provider: 'lrclib' } })
  })

  test('a Track with no Song yet only remembers the choice, since there is nothing to look up', async () => {
    const track = await importTrack()

    const picked = await (await pickProvider(track.id, 'genius')).json()

    expect(picked).toMatchObject({ lyricsProvider: 'genius', songTitle: null, lyrics: null })
  })

  test('the Songs offered come from the provider the Track is on', async () => {
    api.lyrics.songs = [ON_LRCLIB]
    api.genius.songs = [ON_GENIUS]
    const track = await importTrack()

    expect(await (await api.get(`/api/tracks/${track.id}/songs`)).json())
      .toMatchObject({ provider: 'lrclib', matches: [ON_LRCLIB] })

    await pickProvider(track.id, 'genius')

    expect(await (await api.get(`/api/tracks/${track.id}/songs`)).json())
      .toMatchObject({ provider: 'genius', matches: [ON_GENIUS] })
  })

  test('a Track on Manual searches nowhere, because its Song is whatever the singer says', async () => {
    api.lyrics.songs = [ON_LRCLIB]
    const track = await importTrack()

    await pickProvider(track.id, 'manual')

    expect(await (await api.get(`/api/tracks/${track.id}/songs`)).json())
      .toMatchObject({ provider: 'manual', matches: [] })
  })

  test.each(['spotify', '', 'LRCLIB', 42])('%j is not a Lyrics Provider', async (provider) => {
    const track = await importTrack()

    const res = await api.post(`/api/tracks/${track.id}/lyrics`, { provider })
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/Lyrics Provider/)
  })

  test('fetching the Lyrics of an unknown Track is a 404', async () => {
    expect((await api.post('/api/tracks/nope/lyrics', {})).status).toBe(404)
  })
})

describe('a Akapela with no Genius token', () => {
  beforeEach(() => {
    api.genius.available = false
  })

  test('does not offer Genius as a provider', async () => {
    expect(await (await api.get('/api/settings')).json()).toEqual({
      defaultLyricsProvider: 'lrclib',
      lyricsProviders: ['lrclib', 'manual'],
      micProcessingDefault: false,
      monitoringDefault: false,
      // False everywhere but the Desktop App, which is the only Akapela that
      // owns its own yt-dlp and can replace it (ADR 0010).
      ytDlpUpdatable: false,
    })
  })

  test('refuses to put a Track on it', async () => {
    const track = await importTrack()

    const res = await pickProvider(track.id, 'genius')
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/Genius is not configured/)

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).lyricsProvider).toBe('lrclib')
  })

  test('leaves LRCLIB and Manual working', async () => {
    api.lyrics.lyrics = { yesterday: SYNCED }
    const track = await importTrack()

    const confirmed = await (await api.confirmSong(track.id, ON_LRCLIB)).json()
    expect(confirmed.lyrics).toMatchObject({ provider: 'lrclib', kind: 'synced' })

    const typed = await (await api.put(`/api/tracks/${track.id}/lyrics`, { text: PASTED })).json()
    expect(typed.lyrics).toMatchObject({ provider: 'manual' })
  })

  test('says so on a Track left on Genius by a token that has since gone', async () => {
    api.genius.available = true
    api.genius.lyrics = { yesterday: FROM_GENIUS }
    const track = await importTrack()
    await pickProvider(track.id, 'genius')
    await api.confirmSong(track.id, ON_GENIUS)

    api.genius.available = false
    const refetched = await (await api.post(`/api/tracks/${track.id}/lyrics`, {})).json()

    expect(refetched.lyricsError).toMatch(/Genius is not configured/)
  })
})

describe('the album art of a Song confirmed on Genius', () => {
  async function trackOnGenius() {
    const track = await importTrack()
    await pickProvider(track.id, 'genius')
    return track
  }

  test('becomes the Track cover, which is the only colour on the Sing screen', async () => {
    api.genius.lyrics = { yesterday: FROM_GENIUS }
    const track = await trackOnGenius()

    const confirmed = await (await api.confirmSong(track.id, ON_GENIUS)).json()

    expect(api.images.requested).toEqual([ALBUM_ART])
    expect(confirmed.coverPath).toBe('cover.jpg')

    const cover = await api.get(`/api/tracks/${track.id}/cover`)
    expect(cover.status).toBe(200)
    expect(cover.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await cover.arrayBuffer())).toEqual(api.images.body)
  })

  test('replaces the artwork the Source came with, leaving one cover file behind', async () => {
    const track = await trackOnGenius()

    await api.confirmSong(track.id, ON_GENIUS)

    const files = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(files.coverPath).toBe('cover.jpg')
    expect((await api.get(`/api/tracks/${track.id}/cover`)).status).toBe(200)
  })

  test.each([
    ['art that will not load', () => { api.images.status = 503 }],
    ['a host that cannot be reached', () => { api.images.error = new Error('ECONNREFUSED') }],
    ['a body that is not an image', () => { api.images.contentType = 'text/html' }],
  ])('%s leaves the cover alone and still confirms the Song', async (_case, breakIt) => {
    const track = await trackOnGenius()
    breakIt()

    const confirmed = await (await api.confirmSong(track.id, ON_GENIUS)).json()

    expect(confirmed).toMatchObject({ songTitle: 'Yesterday', coverPath: 'cover.svg' })
  })

  test('a Song from a provider with no album art leaves the cover alone', async () => {
    const track = await importTrack()

    const confirmed = await (await api.confirmSong(track.id, ON_LRCLIB)).json()

    expect(api.images.requested).toEqual([])
    expect(confirmed.coverPath).toBe('cover.svg')
  })
})

describe('Lyrics typed by hand', () => {
  test('are stored as Manual Plain Lyrics and put the Track on Manual', async () => {
    const track = await importTrack()

    const res = await api.put(`/api/tracks/${track.id}/lyrics`, { text: PASTED })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      lyricsProvider: 'manual',
      lyrics: {
        provider: 'manual',
        kind: 'plain',
        lines: [
          { text: 'Yesterday' },
          { text: 'All my troubles seemed so far away' },
          { text: '' },
          { text: 'Suddenly' },
        ],
      },
    })

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).lyrics)
      .toMatchObject({ provider: 'manual', kind: 'plain' })
  })

  test('replace fetched Lyrics when the singer edits them, timings and all', async () => {
    api.lyrics.lyrics = { yesterday: SYNCED }
    const track = await importTrack()
    await api.confirmSong(track.id, ON_LRCLIB)

    const edited = await (await api.put(`/api/tracks/${track.id}/lyrics`, {
      text: 'Yesterday\nAll my troubles seemed so far away',
    })).json()

    expect(edited).toMatchObject({
      lyricsProvider: 'manual',
      lyrics: {
        provider: 'manual',
        kind: 'plain',
        lines: [{ text: 'Yesterday' }, { text: 'All my troubles seemed so far away' }],
      },
    })
  })

  test('survive confirming the Song while the Track is on Manual', async () => {
    const track = await importTrack()
    await api.put(`/api/tracks/${track.id}/lyrics`, { text: PASTED })

    const confirmed = await (await api.confirmSong(track.id, ON_LRCLIB)).json()

    expect(confirmed).toMatchObject({ songTitle: 'Yesterday', lyrics: { provider: 'manual' } })
  })

  test.each([{ text: '' }, { text: '  \n ' }, { text: 42 }, {}, { text: 'x'.repeat(50_001) }])(
    '%j is not Lyrics and leaves the Track as it was',
    async (body) => {
      api.lyrics.lyrics = { yesterday: SYNCED }
      const track = await importTrack()
      await api.confirmSong(track.id, ON_LRCLIB)

      const res = await api.put(`/api/tracks/${track.id}/lyrics`, body)
      expect(res.status).toBe(400)
      expect(res.statusText).toMatch(/one line of text per line sung/)

      expect((await (await api.get(`/api/tracks/${track.id}`)).json()))
        .toMatchObject({ lyricsProvider: 'lrclib', lyrics: { provider: 'lrclib' } })
    },
  )

  test('typing Lyrics on an unknown Track is a 404', async () => {
    expect((await api.put('/api/tracks/nope/lyrics', { text: PASTED })).status).toBe(404)
  })
})

describe('fetching over Lyrics that were typed by hand', () => {
  /** A Track whose words the singer typed, then set to fetch from LRCLIB. */
  async function trackWithTypedLyrics() {
    api.lyrics.lyrics = { yesterday: SYNCED }
    const track = await importTrack()
    await api.put(`/api/tracks/${track.id}/lyrics`, { text: PASTED })
    return track
  }

  test('is refused until the singer says to, and changes nothing meanwhile', async () => {
    const track = await trackWithTypedLyrics()
    await api.confirmSong(track.id, ON_LRCLIB)

    const res = await pickProvider(track.id, 'lrclib')
    expect(res.status).toBe(409)
    expect(res.statusText).toMatch(/typed by hand/)

    expect(await (await api.get(`/api/tracks/${track.id}`)).json()).toMatchObject({
      lyricsProvider: 'manual',
      lyrics: { provider: 'manual' },
    })
  })

  test('goes ahead once it says so', async () => {
    const track = await trackWithTypedLyrics()
    await api.confirmSong(track.id, ON_LRCLIB)

    const replaced = await (await pickProvider(track.id, 'lrclib', true)).json()

    expect(replaced).toMatchObject({
      lyricsProvider: 'lrclib',
      lyrics: { provider: 'lrclib', kind: 'synced' },
    })
  })

  test('confirming a Song is refused the same way, and confirms nothing', async () => {
    const track = await trackWithTypedLyrics()
    // Picking a provider before a Song is confirmed fetches nothing, so the
    // typed words are still there when the Song arrives.
    await pickProvider(track.id, 'lrclib')

    const res = await api.confirmSong(track.id, ON_LRCLIB)
    expect(res.status).toBe(409)
    expect(res.statusText).toMatch(/typed by hand/)

    expect(await (await api.get(`/api/tracks/${track.id}`)).json()).toMatchObject({
      songTitle: null,
      lyrics: { provider: 'manual' },
    })
  })

  test('and goes ahead when the singer has said so', async () => {
    const track = await trackWithTypedLyrics()
    await pickProvider(track.id, 'lrclib')

    const confirmed = await (await api.confirmSong(track.id, { ...ON_LRCLIB, overwriteManual: true })).json()

    expect(confirmed).toMatchObject({ songTitle: 'Yesterday', lyrics: { provider: 'lrclib', kind: 'synced' } })
  })

  test('a provider that is down does not take the typed words with it', async () => {
    const track = await trackWithTypedLyrics()
    await api.confirmSong(track.id, ON_LRCLIB)
    api.lyrics.fetchError = new LyricsProviderError('lrclib', 'HTTP 503')

    const attempted = await (await pickProvider(track.id, 'lrclib', true)).json()

    // The Lyrics belong to the Song, so a failed fetch still clears them; what
    // matters is that the singer was asked first.
    expect(attempted).toMatchObject({ lyrics: null })
    expect(attempted.lyricsError).toMatch(/LRCLIB could not be reached/)
  })
})

describe('the default Lyrics Provider', () => {
  test('starts as LRCLIB, which needs no account', async () => {
    expect(await (await api.get('/api/settings')).json()).toEqual({
      defaultLyricsProvider: 'lrclib',
      lyricsProviders: ['lrclib', 'genius', 'manual'],
      micProcessingDefault: false,
      monitoringDefault: false,
      // False everywhere but the Desktop App, which is the only Akapela that
      // owns its own yt-dlp and can replace it (ADR 0010).
      ytDlpUpdatable: false,
    })
  })

  test('is saved and read back', async () => {
    const res = await api.put('/api/settings', { defaultLyricsProvider: 'genius' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ defaultLyricsProvider: 'genius' })

    expect((await (await api.get('/api/settings')).json()).defaultLyricsProvider).toBe('genius')
  })

  test('falls back when the provider it names is no longer configured', async () => {
    await api.put('/api/settings', { defaultLyricsProvider: 'genius' })
    api.genius.available = false

    expect((await (await api.get('/api/settings')).json()).defaultLyricsProvider).toBe('lrclib')
  })

  test.each([{ defaultLyricsProvider: 'spotify' }, { defaultLyricsProvider: 42 }, {}])(
    '%j is rejected and leaves the default alone',
    async (body) => {
      await api.put('/api/settings', { defaultLyricsProvider: 'genius' })

      const res = await api.put('/api/settings', body)
      expect(res.status).toBe(400)

      expect((await (await api.get('/api/settings')).json()).defaultLyricsProvider).toBe('genius')
    },
  )

  test('cannot be set to a provider this Akapela has no token for', async () => {
    api.genius.available = false

    const res = await api.put('/api/settings', { defaultLyricsProvider: 'genius' })
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/Genius is not configured/)
  })
})
