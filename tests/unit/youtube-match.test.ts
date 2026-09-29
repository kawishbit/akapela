import { describe, expect, test } from 'vitest'
import { chooseYoutubeMatch, youtubeSearchQuery, type YoutubeSearchResult } from '../../server/lib/youtube-match'
import { parseYoutubeSearch } from '../../server/lib/sources'

function result(id: string, overrides: Partial<YoutubeSearchResult> = {}): YoutubeSearchResult {
  return { url: `https://www.youtube.com/watch?v=${id}`, title: id, uploader: 'Someone', durationMs: 200_000, ...overrides }
}

describe('chooseYoutubeMatch', () => {
  test('takes the first result within ten seconds of the song', () => {
    const results = [
      result('too-long', { durationMs: 211_000 }),
      result('close', { durationMs: 209_500 }),
      result('also-close', { durationMs: 200_000 }),
    ]
    expect(chooseYoutubeMatch(results, 200_000)?.title).toBe('close')
  })

  test('is null when nothing is within ten seconds', () => {
    const results = [result('a', { durationMs: 189_000 }), result('b', { durationMs: 211_000 }), result('c', { durationMs: null })]
    expect(chooseYoutubeMatch(results, 200_000)).toBeNull()
    expect(chooseYoutubeMatch([], 200_000)).toBeNull()
  })

  test('prefers an artist\'s Topic channel over anything before it', () => {
    const results = [
      result('video', { title: 'Queen - Don\'t Stop Me Now (Official Video)' }),
      result('lyrics', { title: 'Queen - Don\'t Stop Me Now (Lyrics)' }),
      result('topic', { title: 'Don\'t Stop Me Now', uploader: 'Queen - Topic' }),
    ]
    expect(chooseYoutubeMatch(results, 200_000)?.title).toBe('Don\'t Stop Me Now')
  })

  test('then prefers what isn\'t a music video', () => {
    const results = [
      result('Queen - Don\'t Stop Me Now (Official Music Video)'),
      result('Queen - Don\'t Stop Me Now [Music Video]'),
      result('Queen - Don\'t Stop Me Now (Remastered 2011)'),
    ]
    expect(chooseYoutubeMatch(results, 200_000)?.title).toBe('Queen - Don\'t Stop Me Now (Remastered 2011)')
  })

  test('then takes a music video rather than nothing', () => {
    expect(chooseYoutubeMatch([result('Queen - Don\'t Stop Me Now (Official Video)')], 200_000)).not.toBeNull()
  })

  test('a Topic channel too far off in length is still passed over', () => {
    const results = [result('topic', { uploader: 'Queen - Topic', durationMs: 260_000 }), result('upload')]
    expect(chooseYoutubeMatch(results, 200_000)?.title).toBe('upload')
  })

  test('searches for the song as Spotify lists it', () => {
    expect(youtubeSearchQuery('Queen, David Bowie', 'Under Pressure')).toBe('Queen, David Bowie - Under Pressure')
  })
})

describe('parseYoutubeSearch', () => {
  test('reads yt-dlp\'s flat search listing', () => {
    const stdout = JSON.stringify({
      _type: 'playlist',
      entries: [
        { id: 'HgzGwKwLmgM', title: 'Don\'t Stop Me Now', channel: 'Queen - Topic', duration: 209.4 },
        { id: 'Wx5iZvbSxzA', title: 'Queen - Don\'t Stop Me Now (Official Video)', uploader: 'Queen Official', duration: null },
        { title: 'no id' },
      ],
    })
    expect(parseYoutubeSearch(stdout)).toEqual([
      { url: 'https://www.youtube.com/watch?v=HgzGwKwLmgM', title: 'Don\'t Stop Me Now', uploader: 'Queen - Topic', durationMs: 209_400 },
      { url: 'https://www.youtube.com/watch?v=Wx5iZvbSxzA', title: 'Queen - Don\'t Stop Me Now (Official Video)', uploader: 'Queen Official', durationMs: null },
    ])
  })

  test('reads nothing from something that is not a listing', () => {
    expect(parseYoutubeSearch('not json')).toEqual([])
    expect(parseYoutubeSearch('{}')).toEqual([])
  })
})
