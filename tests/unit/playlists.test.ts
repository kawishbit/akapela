import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { PlaylistError, SpotifyEmbedReader } from '../../server/lib/playlists'
import type { CodedError } from '../../shared/error-codes'
import type { PlaylistLink } from '../../shared/playlist-link'

const FIXTURES = join(process.cwd(), 'tests/fixtures/spotify')

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

/** A stand-in web: each URL answers with a body and a status, anything else with a 404. No test reaches Spotify. */
function fakeFetch(pages: Record<string, string | { status: number, body?: string }>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const page = pages[String(input)]
    if (page === undefined) return new Response('not found', { status: 404 })
    if (typeof page === 'string') return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } })
    return new Response(page.body ?? '', { status: page.status })
  }) as unknown as typeof fetch
}

const PLAYLIST_50: PlaylistLink = { service: 'spotify', kind: 'playlist', id: '37i9dQZF1DX4UtSsGT1Sbe' }
const PLAYLIST_150: PlaylistLink = { service: 'spotify', kind: 'playlist', id: '5ABHKGoOzxkaa28ttQV9sE' }
const ALBUM: PlaylistLink = { service: 'spotify', kind: 'album', id: '2yuTRGIackbcReLUXOYBqU' }

const embedUrl = (link: PlaylistLink) => `https://open.spotify.com/embed/${link.kind}/${link.id}`
const pageUrl = (link: PlaylistLink) => `https://open.spotify.com/${link.kind}/${link.id}`

async function refusal(promise: Promise<unknown>): Promise<CodedError> {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(PlaylistError)
  return error as CodedError
}

/** An embed page that lists `count` songs, cut from the 150 fixture's 100. */
function embedListing(count: number): string {
  const html = fixture('playlist-150-embed.html')
  return html.replace(/(<script id="__NEXT_DATA__" type="application\/json">)([\s\S]*?)(<\/script>)/, (_, open, json, close) => {
    const data = JSON.parse(json)
    const entity = data.props.pageProps.state.data.entity
    entity.trackList = entity.trackList.slice(0, count)
    return open + JSON.stringify(data) + close
  })
}

describe('SpotifyEmbedReader', () => {
  test('reads a playlist of 50: its name, every song, and each artist string as Spotify writes it', async () => {
    const reader = new SpotifyEmbedReader(fakeFetch({
      [embedUrl(PLAYLIST_50)]: fixture('playlist-50-embed.html'),
      [pageUrl(PLAYLIST_50)]: fixture('playlist-50-page.html'),
    }))

    const playlist = await reader.read(PLAYLIST_50)

    expect(playlist).toMatchObject({ name: 'All Out 80s', kind: 'playlist', total: 50 })
    expect(playlist.songs).toHaveLength(50)
    expect(playlist.songs[0]).toEqual({
      serviceId: expect.stringMatching(/^spotify:track:/),
      artist: 'Queen, David Bowie',
      title: 'Under Pressure - Remastered 2011',
      durationMs: 248_440,
    })
    expect(new Set(playlist.songs.map(song => song.serviceId)).size).toBe(50)
  })

  test('refuses a playlist of 150 whose embed lists 100, with the total', async () => {
    const reader = new SpotifyEmbedReader(fakeFetch({
      [embedUrl(PLAYLIST_150)]: fixture('playlist-150-embed.html'),
      [pageUrl(PLAYLIST_150)]: fixture('playlist-150-page.html'),
    }))

    const error = await refusal(reader.read(PLAYLIST_150))

    expect(error.failure).toEqual({ code: 'playlistTooLong', params: { total: 150 } })
  })

  test('refuses exactly 100 listed with no total, since there may be more', async () => {
    const reader = new SpotifyEmbedReader(fakeFetch({ [embedUrl(PLAYLIST_150)]: embedListing(100) }))

    const error = await refusal(reader.read(PLAYLIST_150))

    expect(error.failure).toEqual({ code: 'playlistTooLong', params: { total: '100+' } })
  })

  test('reads 99 listed with no total', async () => {
    const reader = new SpotifyEmbedReader(fakeFetch({ [embedUrl(PLAYLIST_150)]: embedListing(99) }))

    const playlist = await reader.read(PLAYLIST_150)

    expect(playlist.total).toBeNull()
    expect(playlist.songs).toHaveLength(99)
  })

  test('reads exactly 100 when the total says that is all of them', async () => {
    const reader = new SpotifyEmbedReader(fakeFetch({
      [embedUrl(PLAYLIST_150)]: embedListing(100),
      [pageUrl(PLAYLIST_150)]: fixture('playlist-150-page.html').replace('content="150"', 'content="100"'),
    }))

    expect((await reader.read(PLAYLIST_150)).songs).toHaveLength(100)
  })

  test('reads an album the same way', async () => {
    const reader = new SpotifyEmbedReader(fakeFetch({
      [embedUrl(ALBUM)]: fixture('album-embed.html'),
      [pageUrl(ALBUM)]: fixture('album-page.html'),
    }))

    const album = await reader.read(ALBUM)

    expect(album).toMatchObject({ name: 'Jazz (2011 Remaster)', kind: 'album' })
    expect(album.songs.map(song => song.title)).toEqual([
      'Mustapha - Remastered 2011',
      'Fat Bottomed Girls - Single Version',
      'Jealousy - Remastered 2011',
      'Bicycle Race - Remastered 2011',
    ])
  })

  test('leaves out a song Spotify will not play rather than failing on it', async () => {
    const html = fixture('album-embed.html').replace('"isPlayable":true', '"isPlayable":false')
    const reader = new SpotifyEmbedReader(fakeFetch({ [embedUrl(ALBUM)]: html }))

    expect((await reader.read(ALBUM)).songs.map(song => song.title)).not.toContain('Mustapha - Remastered 2011')
  })

  test('a page without __NEXT_DATA__ is unreadable, and says why in the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reader = new SpotifyEmbedReader(fakeFetch({ [embedUrl(PLAYLIST_50)]: fixture('no-next-data.html') }))

    const error = await refusal(reader.read(PLAYLIST_50))

    expect(error.failure.code).toBe('playlistUnreadable')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no __NEXT_DATA__'))
    warn.mockRestore()
  })

  test('a page whose data has changed shape is unreadable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = fixture('album-embed.html').replace('"trackList"', '"tracks"')
    const reader = new SpotifyEmbedReader(fakeFetch({ [embedUrl(ALBUM)]: html }))

    expect((await refusal(reader.read(ALBUM))).failure.code).toBe('playlistUnreadable')
    vi.restoreAllMocks()
  })

  test('a 404 is not found', async () => {
    const reader = new SpotifyEmbedReader(fakeFetch({}))

    expect((await refusal(reader.read(PLAYLIST_50))).failure.code).toBe('playlistNotFound')
  })

  test('another failure of Spotify\'s is not blamed on its page', async () => {
    const reader = new SpotifyEmbedReader(fakeFetch({ [embedUrl(PLAYLIST_50)]: { status: 503 } }))

    await expect(reader.read(PLAYLIST_50)).rejects.toThrow(/HTTP 503/)
  })
})
