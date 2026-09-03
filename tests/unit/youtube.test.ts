import { describe, expect, test } from 'vitest'
import { canonicalYoutubeUrl, youtubePlaceholderTitle, youtubeVideoId } from '../../shared/youtube'

const ID = 'dQw4w9WgXcQ'

describe('youtubeVideoId', () => {
  test.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'a watch URL'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=4', 'a watch URL inside a playlist'],
    ['https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ', 'a watch URL with v not first'],
    ['https://youtu.be/dQw4w9WgXcQ', 'a short URL'],
    ['https://youtu.be/dQw4w9WgXcQ?t=43', 'a short URL with a timestamp'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'a shorts URL'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'an embed URL'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'a privacy-enhanced embed URL'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'a live URL'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'a mobile URL'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'a YouTube Music URL'],
    ['http://www.youtube.com/watch?v=dQw4w9WgXcQ', 'a plain http URL'],
    ['youtube.com/watch?v=dQw4w9WgXcQ', 'a URL with no scheme'],
    ['youtu.be/dQw4w9WgXcQ', 'a short URL with no scheme'],
    ['  https://youtu.be/dQw4w9WgXcQ  ', 'a URL with surrounding whitespace'],
  ])('reads the id from %s (%s)', (url) => {
    expect(youtubeVideoId(url)).toBe(ID)
  })

  test.each([
    ['', 'nothing'],
    ['never gonna give you up', 'a search phrase'],
    ['https://vimeo.com/123456789', 'another site'],
    ['https://www.youtube.com/playlist?list=PL123', 'a playlist'],
    ['https://www.youtube.com/@RickAstley', 'a channel'],
    ['https://www.youtube.com/', 'the home page'],
    ['https://www.youtube.com/watch', 'a watch URL with no video'],
    ['https://www.youtube.com/watch?v=tooshort', 'an id of the wrong length'],
    ['https://youtu.be/dQw4w9WgXcQ/extra', 'a short URL with extra path'],
    ['ftp://www.youtube.com/watch?v=dQw4w9WgXcQ', 'a non-web scheme'],
    ['https://notyoutube.com/watch?v=dQw4w9WgXcQ', 'a look-alike host'],
    ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'a host that merely starts with youtube.com'],
  ])('rejects %s (%s)', (url) => {
    expect(youtubeVideoId(url)).toBeNull()
  })
})

describe('canonicalYoutubeUrl', () => {
  test('is the www watch URL for the id', () => {
    expect(canonicalYoutubeUrl(ID)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })
})

describe('youtubePlaceholderTitle', () => {
  test('is the short URL, which a singer can recognise at a glance', () => {
    expect(youtubePlaceholderTitle(ID)).toBe('youtu.be/dQw4w9WgXcQ')
  })
})
