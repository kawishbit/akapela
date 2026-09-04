import { describe, expect, test } from 'vitest'
import { createLrclibProvider } from '../../server/lyrics/lrclib'
import { LyricsProviderError } from '../../server/lyrics/provider'
import type { Song } from '../../shared/song'

/** One LRCLIB record, as its search and get endpoints both return it. */
const YESTERDAY = {
  id: 3396226,
  trackName: 'Yesterday',
  artistName: 'The Beatles',
  albumName: 'Help!',
  duration: 125,
  instrumental: false,
  plainLyrics: 'Yesterday\nAll my troubles seemed so far away',
  syncedLyrics: '[00:12.34]Yesterday\n[00:15.00]All my troubles seemed so far away',
}

/** A fetch that answers every call with the same body, remembering the URLs it was asked for. */
function stubFetch(body: unknown, init: { status?: number } = {}) {
  const urls: string[] = []
  const fetch = (async (input: string | URL) => {
    urls.push(String(input))
    return new Response(init.status === 404 ? '' : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof globalThis.fetch
  return { fetch, urls }
}

const SONG: Song = {
  artist: 'The Beatles',
  title: 'Yesterday',
  providerIds: { lrclib: '3396226' },
  albumArtUrl: null,
}

describe('the LRCLIB provider searching Songs', () => {
  test('asks for the artist and title and returns the matches it knows', async () => {
    const { fetch, urls } = stubFetch([YESTERDAY])
    const provider = createLrclibProvider({ fetch })

    const matches = await provider.searchSongs({ artist: 'The Beatles', title: 'Yesterday', durationMs: 125_000 })

    expect(urls[0]).toContain('/api/search?')
    expect(urls[0]).toContain('track_name=Yesterday')
    expect(urls[0]).toContain('artist_name=The+Beatles')
    expect(matches).toEqual([
      {
        artist: 'The Beatles',
        title: 'Yesterday',
        album: 'Help!',
        durationMs: 125_000,
        instrumental: false,
        providerIds: { lrclib: '3396226' },
        albumArtUrl: null,
      },
    ])
  })

  test('puts the release whose length matches the Backing Track first', async () => {
    const { fetch } = stubFetch([
      { ...YESTERDAY, id: 1, albumName: 'a live album', duration: 240 },
      { ...YESTERDAY, id: 2, albumName: 'no length known', duration: null },
      { ...YESTERDAY, id: 3, albumName: 'the single', duration: 126 },
    ])

    const matches = await createLrclibProvider({ fetch }).searchSongs({
      artist: 'The Beatles',
      title: 'Yesterday',
      durationMs: 125_000,
    })

    expect(matches.map(match => match.album)).toEqual(['the single', 'a live album', 'no length known'])
  })

  test('keeps the order LRCLIB gave when the Backing Track has no duration yet', async () => {
    const { fetch } = stubFetch([
      { ...YESTERDAY, id: 1, albumName: 'first', duration: 240 },
      { ...YESTERDAY, id: 2, albumName: 'second', duration: 126 },
    ])

    const matches = await createLrclibProvider({ fetch }).searchSongs({ artist: '', title: 'Yesterday' })

    expect(matches.map(match => match.album)).toEqual(['first', 'second'])
  })

  test('searches on the title alone when the guess has no artist', async () => {
    const { fetch, urls } = stubFetch([YESTERDAY])
    await createLrclibProvider({ fetch }).searchSongs({ artist: '', title: 'Yesterday' })
    expect(urls[0]).toContain('/api/search?q=Yesterday')
  })

  test('a Song LRCLIB has never heard of is no matches rather than a failure', async () => {
    const { fetch } = stubFetch(null, { status: 404 })
    await expect(createLrclibProvider({ fetch }).searchSongs({ artist: '', title: 'Nope' })).resolves.toEqual([])
  })

  test('a broken LRCLIB is reported rather than swallowed', async () => {
    const { fetch } = stubFetch(null, { status: 503 })
    await expect(createLrclibProvider({ fetch }).searchSongs({ artist: '', title: 'Yesterday' }))
      .rejects.toBeInstanceOf(LyricsProviderError)
  })
})

describe('the LRCLIB provider fetching Lyrics', () => {
  test('fetches by the id it gave for the Song and prefers Synced Lyrics', async () => {
    const { fetch, urls } = stubFetch(YESTERDAY)

    const lyrics = await createLrclibProvider({ fetch }).fetchLyrics(SONG)

    expect(urls[0]).toContain('/api/get/3396226')
    expect(lyrics).toEqual({
      kind: 'synced',
      lines: [
        { text: 'Yesterday', atMs: 12_340 },
        { text: 'All my troubles seemed so far away', atMs: 15_000 },
      ],
    })
  })

  test('fetches by artist and title for a Song typed by hand', async () => {
    const { fetch, urls } = stubFetch(YESTERDAY)

    await createLrclibProvider({ fetch }).fetchLyrics({ ...SONG, providerIds: {} })

    expect(urls[0]).toContain('/api/get?')
    expect(urls[0]).toContain('track_name=Yesterday')
    expect(urls[0]).toContain('artist_name=The+Beatles')
  })

  test('falls back to Plain Lyrics when LRCLIB has no timings', async () => {
    const { fetch } = stubFetch({ ...YESTERDAY, syncedLyrics: null })

    expect(await createLrclibProvider({ fetch }).fetchLyrics(SONG)).toEqual({
      kind: 'plain',
      lines: [{ text: 'Yesterday' }, { text: 'All my troubles seemed so far away' }],
    })
  })

  test.each([
    [{ ...YESTERDAY, syncedLyrics: null, plainLyrics: null }, 'a record with no words'],
    [{ ...YESTERDAY, instrumental: true, syncedLyrics: null, plainLyrics: '' }, 'an instrumental recording'],
  ])('has no Lyrics for %#: %s', async (body) => {
    const { fetch } = stubFetch(body)
    expect(await createLrclibProvider({ fetch }).fetchLyrics(SONG)).toBeNull()
  })

  test('a Song LRCLIB does not have is no Lyrics rather than a failure', async () => {
    const { fetch } = stubFetch(null, { status: 404 })
    expect(await createLrclibProvider({ fetch }).fetchLyrics(SONG)).toBeNull()
  })

  test('a broken LRCLIB is reported rather than swallowed', async () => {
    const { fetch } = stubFetch(null, { status: 500 })
    await expect(createLrclibProvider({ fetch }).fetchLyrics(SONG)).rejects.toBeInstanceOf(LyricsProviderError)
  })
})
