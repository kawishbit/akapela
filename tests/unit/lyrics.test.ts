import { describe, expect, test } from 'vitest'
import {
  LYRICS_OFFSET_MAX_MS,
  LYRICS_OFFSET_MIN_MS,
  currentLineIndex,
  nudgeLyricsOffset,
  parseLrc,
  parsePlainLyrics,
  parseLyricsOffset,
  plainScrollFraction,
  type LyricsLine,
} from '../../shared/lyrics'

describe('parseLrc', () => {
  test('reads a timestamp and its text from each line', () => {
    expect(parseLrc('[00:12.34]Yesterday\n[00:15.00]All my troubles')).toEqual([
      { text: 'Yesterday', atMs: 12_340 },
      { text: 'All my troubles', atMs: 15_000 },
    ])
  })

  test('reads hundredths and thousandths of a second', () => {
    expect(parseLrc('[00:01.5]a\n[00:02.05]b\n[00:03.005]c')).toEqual([
      { text: 'a', atMs: 1_500 },
      { text: 'b', atMs: 2_050 },
      { text: 'c', atMs: 3_005 },
    ])
  })

  test('reads minutes past sixty seconds', () => {
    expect(parseLrc('[03:07.20]late')).toEqual([{ text: 'late', atMs: 187_200 }])
  })

  test('repeats a line carrying several timestamps', () => {
    expect(parseLrc('[00:10.00][01:10.00]chorus')).toEqual([
      { text: 'chorus', atMs: 10_000 },
      { text: 'chorus', atMs: 70_000 },
    ])
  })

  test('keeps an empty timestamped line, which marks an instrumental break', () => {
    expect(parseLrc('[00:00.00]\n[00:12.34]Yesterday')).toEqual([
      { text: '', atMs: 0 },
      { text: 'Yesterday', atMs: 12_340 },
    ])
  })

  test('drops metadata tags and untimed lines', () => {
    expect(parseLrc('[ar: The Beatles]\n[length: 02:05]\nstray text\n[00:01.00]Yesterday')).toEqual([
      { text: 'Yesterday', atMs: 1_000 },
    ])
  })

  test('sorts lines by their timestamp', () => {
    expect(parseLrc('[00:20.00]second\n[00:10.00]first')).toEqual([
      { text: 'first', atMs: 10_000 },
      { text: 'second', atMs: 20_000 },
    ])
  })

  test('text with no timestamp at all is not Synced Lyrics', () => {
    expect(parseLrc('Yesterday\nAll my troubles')).toEqual([])
  })
})

describe('parsePlainLyrics', () => {
  test('is one line per line of text', () => {
    expect(parsePlainLyrics('Yesterday\nAll my troubles')).toEqual([
      { text: 'Yesterday' },
      { text: 'All my troubles' },
    ])
  })

  test('keeps a blank line between verses but drops blank lines at either end', () => {
    expect(parsePlainLyrics('\n\nfirst\n\nsecond\n\n')).toEqual([
      { text: 'first' },
      { text: '' },
      { text: 'second' },
    ])
  })

  test('accepts windows line endings', () => {
    expect(parsePlainLyrics('first\r\nsecond')).toEqual([{ text: 'first' }, { text: 'second' }])
  })

  test('nothing but whitespace is no Lyrics at all', () => {
    expect(parsePlainLyrics('  \n \n')).toEqual([])
  })
})

const SYNCED: LyricsLine[] = [
  { text: 'first', atMs: 10_000 },
  { text: 'second', atMs: 20_000 },
  { text: 'third', atMs: 30_000 },
]

const PLAIN: LyricsLine[] = [{ text: 'first' }, { text: 'second' }, { text: 'third' }, { text: 'fourth' }]

describe('currentLineIndex for Synced Lyrics', () => {
  const at = (positionMs: number, offsetMs = 0) =>
    currentLineIndex({ kind: 'synced', lines: SYNCED, positionMs, offsetMs, durationMs: 40_000 })

  test('no line is current before the first one', () => {
    expect(at(0)).toBe(-1)
    expect(at(9_999)).toBe(-1)
  })

  test('a line becomes current exactly on its timestamp and stays current until the next', () => {
    expect(at(10_000)).toBe(0)
    expect(at(19_999)).toBe(0)
    expect(at(20_000)).toBe(1)
  })

  test('the last line stays current to the end of the song', () => {
    expect(at(30_000)).toBe(2)
    expect(at(39_999)).toBe(2)
  })

  test('a positive Lyrics Offset holds each line back for a longer intro', () => {
    expect(at(10_000, 2_000)).toBe(-1)
    expect(at(12_000, 2_000)).toBe(0)
    expect(at(22_000, 2_000)).toBe(1)
  })

  test('a negative Lyrics Offset brings each line forward', () => {
    expect(at(8_000, -2_000)).toBe(0)
    expect(at(18_000, -2_000)).toBe(1)
  })

  test('no lines means no current line', () => {
    expect(currentLineIndex({ kind: 'synced', lines: [], positionMs: 5_000, offsetMs: 0, durationMs: 40_000 })).toBe(-1)
  })
})

describe('currentLineIndex for Plain Lyrics', () => {
  const at = (positionMs: number, offsetMs = 0) =>
    currentLineIndex({ kind: 'plain', lines: PLAIN, positionMs, offsetMs, durationMs: 40_000 })

  test('lines are spread evenly across the song', () => {
    expect(at(0)).toBe(0)
    expect(at(9_999)).toBe(0)
    expect(at(10_000)).toBe(1)
    expect(at(20_000)).toBe(2)
    expect(at(30_000)).toBe(3)
  })

  test('the last line stays current at and past the end', () => {
    expect(at(40_000)).toBe(3)
    expect(at(50_000)).toBe(3)
  })

  test('a positive Lyrics Offset holds the first line while the intro plays', () => {
    expect(at(5_000, 5_000)).toBe(0)
    expect(at(15_000, 5_000)).toBe(1)
  })

  test('a negative Lyrics Offset brings the lines forward', () => {
    expect(at(5_000, -5_000)).toBe(1)
  })

  test('the first line is current before the start rather than no line at all', () => {
    expect(at(0, 5_000)).toBe(0)
  })

  test('an unknown duration leaves the first line current', () => {
    expect(currentLineIndex({ kind: 'plain', lines: PLAIN, positionMs: 5_000, offsetMs: 0, durationMs: 0 })).toBe(0)
  })

  test('no lines means no current line', () => {
    expect(currentLineIndex({ kind: 'plain', lines: [], positionMs: 5_000, offsetMs: 0, durationMs: 40_000 })).toBe(-1)
  })
})

describe('plainScrollFraction', () => {
  test('is the share of the song already played', () => {
    expect(plainScrollFraction(10_000, 0, 40_000)).toBe(0.25)
    expect(plainScrollFraction(30_000, 0, 40_000)).toBe(0.75)
  })

  test('the Lyrics Offset shifts it by that much song time', () => {
    expect(plainScrollFraction(20_000, 10_000, 40_000)).toBe(0.25)
  })

  test('stays within the song', () => {
    expect(plainScrollFraction(-5_000, 0, 40_000)).toBe(0)
    expect(plainScrollFraction(90_000, 0, 40_000)).toBe(1)
  })

  test('an unknown duration is the start of the Lyrics', () => {
    expect(plainScrollFraction(10_000, 0, 0)).toBe(0)
  })
})

describe('nudgeLyricsOffset', () => {
  test('moves a tenth of a second at a time, in either direction', () => {
    expect(nudgeLyricsOffset(0, 1)).toBe(100)
    expect(nudgeLyricsOffset(300, -1)).toBe(200)
    expect(nudgeLyricsOffset(0, -3)).toBe(-300)
  })

  test('stops at the ends of the range', () => {
    expect(nudgeLyricsOffset(LYRICS_OFFSET_MAX_MS, 1)).toBe(LYRICS_OFFSET_MAX_MS)
    expect(nudgeLyricsOffset(LYRICS_OFFSET_MIN_MS, -1)).toBe(LYRICS_OFFSET_MIN_MS)
  })

  test('lands on a whole tenth even from a value that is not one', () => {
    expect(nudgeLyricsOffset(150, 1)).toBe(300)
    expect(nudgeLyricsOffset(0, 0)).toBe(0)
  })
})

describe('parseLyricsOffset', () => {
  test.each([0, 300, -300, LYRICS_OFFSET_MIN_MS, LYRICS_OFFSET_MAX_MS])('accepts %d ms', (offsetMs) => {
    expect(parseLyricsOffset(offsetMs)).toBe(offsetMs)
  })

  test.each([
    LYRICS_OFFSET_MIN_MS - 100,
    LYRICS_OFFSET_MAX_MS + 100,
    250,
    1.5,
    '300',
    null,
    undefined,
    Number.NaN,
  ])('rejects %j because it is not a whole tenth of a second in range', (offsetMs) => {
    expect(() => parseLyricsOffset(offsetMs)).toThrow()
  })
})
