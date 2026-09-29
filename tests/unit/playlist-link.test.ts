import { describe, expect, test } from 'vitest'
import { parsePlaylistLink, playlistUrl } from '../../shared/playlist-link'

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
    `https://www.youtube.com/playlist?list=${ID}`,
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
