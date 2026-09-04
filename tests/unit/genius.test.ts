import { describe, expect, test } from 'vitest'
import { createGeniusProvider } from '../../server/lyrics/genius'
import { LyricsProviderError } from '../../server/lyrics/provider'
import type { Song } from '../../shared/song'

const TOKEN = 'genius-token'

const HIT = {
  id: 1234,
  title: 'Yesterday',
  url: 'https://genius.com/The-beatles-yesterday-lyrics',
  song_art_image_url: 'https://images.genius.com/art.jpg',
  primary_artist: { name: 'The Beatles' },
}

const SONG_DETAIL = {
  ...HIT,
  album: { name: 'Help!', cover_art_url: 'https://images.genius.com/help.jpg' },
}

const PAGE = '<div data-lyrics-container="true">Yesterday<br>All my troubles</div>'

/**
 * Answers each request from a table keyed by a fragment of the URL, remembering
 * what was asked and with which headers, so a test can see both the mapping and
 * the calls the provider made.
 */
function stubFetch(routes: Record<string, { body?: unknown, text?: string, status?: number }>) {
  const calls: { url: string, authorization: string | null }[] = []
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    calls.push({ url, authorization: headers.get('authorization') })
    const key = Object.keys(routes).find(fragment => url.includes(fragment))
    const route = key === undefined ? undefined : routes[key]
    if (!route) return new Response('', { status: 404 })
    if (route.status && route.status >= 400) return new Response('', { status: route.status })
    return route.text === undefined
      ? new Response(JSON.stringify(route.body), {
          status: route.status ?? 200,
          headers: { 'content-type': 'application/json' },
        })
      : new Response(route.text, { status: route.status ?? 200, headers: { 'content-type': 'text/html' } })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

const SEARCH = { response: { hits: [{ type: 'song', result: HIT }] } }
const SONG = { response: { song: SONG_DETAIL } }

const CONFIRMED: Song = {
  artist: 'The Beatles',
  title: 'Yesterday',
  providerIds: { genius: '1234' },
  albumArtUrl: null,
}

describe('the Genius provider without a token', () => {
  test('reports itself unavailable, so the app can leave it out', () => {
    expect(createGeniusProvider({ token: '' }).available).toBe(false)
    expect(createGeniusProvider({ token: TOKEN }).available).toBe(true)
  })

  test('says why rather than answering that it knows no Songs', async () => {
    const provider = createGeniusProvider({ token: '  ' })

    await expect(provider.searchSongs({ artist: 'The Beatles', title: 'Yesterday' }))
      .rejects.toThrow(LyricsProviderError)
    await expect(provider.fetchLyrics(CONFIRMED)).rejects.toThrow(/token/)
  })
})

describe('the Genius provider searching Songs', () => {
  test('asks the API with the token and reads the album off each Song it found', async () => {
    const { fetch, calls } = stubFetch({ '/search': { body: SEARCH }, '/songs/1234': { body: SONG } })
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    const matches = await provider.searchSongs({ artist: 'The Beatles', title: 'Yesterday' })

    expect(calls[0]!.url).toContain('/search?q=The+Beatles+Yesterday')
    expect(calls[0]!.authorization).toBe(`Bearer ${TOKEN}`)
    expect(matches).toEqual([
      {
        artist: 'The Beatles',
        title: 'Yesterday',
        album: 'Help!',
        durationMs: null,
        instrumental: false,
        providerIds: { genius: '1234' },
        albumArtUrl: 'https://images.genius.com/help.jpg',
      },
    ])
  })

  test('keeps the Song when the album cannot be read, since the match is still good', async () => {
    const { fetch } = stubFetch({ '/search': { body: SEARCH }, '/songs/1234': { status: 503 } })
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    expect(await provider.searchSongs({ artist: 'The Beatles', title: 'Yesterday' })).toEqual([
      {
        artist: 'The Beatles',
        title: 'Yesterday',
        album: null,
        durationMs: null,
        instrumental: false,
        providerIds: { genius: '1234' },
        albumArtUrl: 'https://images.genius.com/art.jpg',
      },
    ])
  })

  test('leaves out hits that are not Songs', async () => {
    const hits = { response: { hits: [{ type: 'lyric', result: HIT }, { type: 'song', result: HIT }] } }
    const { fetch } = stubFetch({ '/search': { body: hits }, '/songs/1234': { body: SONG } })
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    expect(await provider.searchSongs({ artist: '', title: 'Yesterday' })).toHaveLength(1)
  })

  test('a search with nothing to search for asks nothing', async () => {
    const { fetch, calls } = stubFetch({})
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    expect(await provider.searchSongs({ artist: 'The Beatles', title: '  ' })).toEqual([])
    expect(calls).toEqual([])
  })

  test('an unhappy API is reported rather than read as no matches', async () => {
    const { fetch } = stubFetch({ '/search': { status: 401 } })
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    await expect(provider.searchSongs({ artist: 'The Beatles', title: 'Yesterday' }))
      .rejects.toThrow(/Genius could not be reached: HTTP 401/)
  })
})

describe('the Genius provider fetching Lyrics', () => {
  test('reads the song page the API points at, as Plain Lyrics', async () => {
    const { fetch, calls } = stubFetch({
      '/songs/1234': { body: SONG },
      'genius.com/The-beatles': { text: PAGE },
    })
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    expect(await provider.fetchLyrics(CONFIRMED)).toEqual({
      kind: 'plain',
      lines: [{ text: 'Yesterday' }, { text: 'All my troubles' }],
    })
    expect(calls.map(call => call.url)).toEqual([
      expect.stringContaining('/songs/1234'),
      HIT.url,
    ])
    // The page is a plain web page, not the API, so the token is not sent to it.
    expect(calls[1]!.authorization).toBeNull()
  })

  test('searches first for a Song confirmed somewhere else, which has no Genius id', async () => {
    const { fetch, calls } = stubFetch({
      '/search': { body: SEARCH },
      '/songs/1234': { body: SONG },
      'genius.com/The-beatles': { text: PAGE },
    })
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    const found = await provider.fetchLyrics({ ...CONFIRMED, providerIds: { lrclib: '99' } })

    expect(found?.lines).toHaveLength(2)
    expect(calls[0]!.url).toContain('/search?')
  })

  test('a Song Genius does not know has no Lyrics rather than an error', async () => {
    const { fetch } = stubFetch({ '/search': { body: { response: { hits: [] } } } })
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    expect(await provider.fetchLyrics({ ...CONFIRMED, providerIds: {} })).toBeNull()
  })

  test('a page whose words cannot be found has none, rather than the page furniture', async () => {
    const { fetch } = stubFetch({
      '/songs/1234': { body: SONG },
      'genius.com/The-beatles': { text: '<html><body><p>Something else entirely</p></body></html>' },
    })
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    expect(await provider.fetchLyrics(CONFIRMED)).toBeNull()
  })

  test('a song page that will not load is reported', async () => {
    const { fetch } = stubFetch({
      '/songs/1234': { body: SONG },
      'genius.com/The-beatles': { status: 503 },
    })
    const provider = createGeniusProvider({ token: TOKEN, fetch })

    await expect(provider.fetchLyrics(CONFIRMED)).rejects.toThrow(/Genius could not be reached: HTTP 503/)
  })
})
