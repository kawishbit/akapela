import { describe, expect, test } from 'vitest'
import { parsePlaylistLink, playlistInVideoLink, playlistUrl, unsupportedYoutubeList } from '../../shared/playlist-link'

const ID = '37i9dQZF1DX4UtSsGT1Sbe'

describe('parsePlaylistLink', () => {
  test.each([
    [`https://open.spotify.com/playlist/${ID}`, 'playlist'],
    [`https://open.spotify.com/playlist/${ID}?si=abc123&pi=x`, 'playlist'],
    [`https://open.spotify.com/intl-id/playlist/${ID}`, 'playlist'],
    [`open.spotify.com/playlist/${ID}`, 'playlist'],
    [`  https://open.spotify.com/album/${ID}  `, 'album'],
    [`https://open.spotify.com/intl-pt/album/${ID}?si=1`, 'album'],
    [`https://open.spotify.com/embed/playlist/${ID}`, 'playlist'],
    [`spotify:playlist:${ID}`, 'playlist'],
    [`spotify:album:${ID}`, 'album'],
  ])('reads %s', (link, kind) => {
    expect(parsePlaylistLink(link)).toEqual({ service: 'spotify', kind, id: ID })
  })

  test.each([
    `https://open.spotify.com/track/${ID}`,
    `https://open.spotify.com/artist/${ID}`,
    `spotify:track:${ID}`,
    `https://example.com/playlist/${ID}`,
    `https://open.spotify.com/playlist/`,
    `https://open.spotify.com/playlist/${ID}/extra`,
    `ftp://open.spotify.com/playlist/${ID}`,
    '',
    'not a link at all',
  ])('refuses %s', (link) => {
    expect(parsePlaylistLink(link)).toBeNull()
  })

  test('the canonical link reads back as itself', () => {
    const link = parsePlaylistLink(`spotify:album:${ID}`)!
    expect(playlistUrl(link)).toBe(`https://open.spotify.com/album/${ID}`)
    expect(parsePlaylistLink(playlistUrl(link))).toEqual(link)
  })
})

const LIST = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG'
const ALBUM = 'OLAK5uy_kNBvTM4hh0S4KSd7xRGOcEuf8iMSKTdNE'

describe('parsePlaylistLink, for YouTube', () => {
  test.each([
    `https://www.youtube.com/playlist?list=${LIST}`,
    `youtube.com/playlist?list=${LIST}&si=abc`,
    `https://m.youtube.com/playlist?list=${LIST}`,
    `https://music.youtube.com/playlist?list=${LIST}`,
  ])('reads %s as a playlist', (link) => {
    expect(parsePlaylistLink(link)).toEqual({ service: 'youtube', kind: 'playlist', id: LIST })
  })

  test('reads a playlist YouTube Music made itself, which is not a Mix', () => {
    expect(parsePlaylistLink('https://music.youtube.com/playlist?list=RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs'))
      .toEqual({ service: 'youtube', kind: 'playlist', id: 'RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs' })
  })

  test('reads a YouTube Music album as an album', () => {
    expect(parsePlaylistLink(`https://music.youtube.com/playlist?list=${ALBUM}`))
      .toEqual({ service: 'youtube', kind: 'album', id: ALBUM })
  })

  test.each([
    `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${LIST}`,
    'https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ',
    'https://www.youtube.com/playlist',
    'https://www.youtube.com/@queenofficial',
    `https://example.com/playlist?list=${LIST}`,
  ])('refuses %s', (link) => {
    expect(parsePlaylistLink(link)).toBeNull()
  })

  test('the canonical link reads back as itself', () => {
    const link = parsePlaylistLink(`https://music.youtube.com/playlist?list=${ALBUM}`)!
    expect(playlistUrl(link)).toBe(`https://www.youtube.com/playlist?list=${ALBUM}`)
    expect(parsePlaylistLink(playlistUrl(link))).toEqual(link)
  })
})

describe('playlistInVideoLink', () => {
  test('is the playlist a video was opened from', () => {
    expect(playlistInVideoLink(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${LIST}&index=3`))
      .toEqual({ service: 'youtube', kind: 'playlist', id: LIST })
  })

  test.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ',
    `https://www.youtube.com/playlist?list=${LIST}`,
  ])('is nothing for %s', (link) => {
    expect(playlistInVideoLink(link)).toBeNull()
  })
})

describe('unsupportedYoutubeList', () => {
  test.each([
    'https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ',
    'https://www.youtube.com/@queenofficial',
    'https://www.youtube.com/channel/UCiMhD4jzUqG-IgPzUmmytRQ',
    'https://www.youtube.com/c/Queen/videos',
  ])('is true for the Mix or channel %s', (link) => {
    expect(unsupportedYoutubeList(link)).toBe(true)
  })

  test.each([
    `https://www.youtube.com/playlist?list=${LIST}`,
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    `https://open.spotify.com/playlist/${ID}`,
  ])('is false for %s', (link) => {
    expect(unsupportedYoutubeList(link)).toBe(false)
  })
})
