import { describe, expect, test } from 'vitest'
import { guessSongs } from '../../shared/song'

describe('guessSongs', () => {
  test('splits a dashed video title into artist and title, and offers the reverse order too', () => {
    expect(guessSongs('The Beatles - Yesterday')).toEqual([
      { artist: 'The Beatles', title: 'Yesterday' },
      { artist: 'Yesterday', title: 'The Beatles' },
    ])
  })

  test('splits on a pipe as well as a dash', () => {
    expect(guessSongs('Adele | Hello')).toEqual([
      { artist: 'Adele', title: 'Hello' },
      { artist: 'Hello', title: 'Adele' },
    ])
  })

  test('splits on the first separator only, so a dashed title stays whole', () => {
    expect(guessSongs('Radiohead - Paranoid Android - Live')[0]).toEqual({
      artist: 'Radiohead',
      title: 'Paranoid Android - Live',
    })
  })

  test('leaves a hyphenated name alone because a separator needs space around it', () => {
    expect(guessSongs('Jay-Z - 99 Problems')[0]).toEqual({ artist: 'Jay-Z', title: '99 Problems' })
  })

  test.each([
    ['The Beatles - Yesterday (Karaoke Version)', 'a parenthesised karaoke note'],
    ['The Beatles - Yesterday [Official Music Video]', 'a bracketed official video note'],
    ['The Beatles - Yesterday (Official Audio) [HD]', 'two noise segments'],
    ['The Beatles - Yesterday (Instrumental with Lyrics)', 'a segment naming several noise words'],
  ])('strips %s (%s)', (title) => {
    expect(guessSongs(title)[0]).toEqual({ artist: 'The Beatles', title: 'Yesterday' })
  })

  test('keeps a bracketed segment that carries no noise word', () => {
    expect(guessSongs('Elton John - Rocket Man (feat. Someone)')[0]).toEqual({
      artist: 'Elton John',
      title: 'Rocket Man (feat. Someone)',
    })
  })

  test.each([
    ['The Beatles - Yesterday Karaoke', 'karaoke'],
    ['The Beatles - Yesterday HD', 'HD'],
    ['The Beatles - Yesterday Lyrics', 'lyrics'],
    ['The Beatles - Yesterday INSTRUMENTAL', 'instrumental in caps'],
  ])('strips the standalone noise word in %s (%s)', (title) => {
    expect(guessSongs(title)[0]).toEqual({ artist: 'The Beatles', title: 'Yesterday' })
  })

  test('does not strip a noise word that is only part of a longer word', () => {
    expect(guessSongs('Karaokes - Officially Missing You')[0]).toEqual({
      artist: 'Karaokes',
      title: 'Officially Missing You',
    })
  })

  test('drops a separator left stranded by a leading noise word', () => {
    expect(guessSongs('KARAOKE | Yesterday | The Beatles')[0]).toEqual({
      artist: 'Yesterday',
      title: 'The Beatles',
    })
  })

  test('strips surrounding quotes from either side', () => {
    expect(guessSongs('The Beatles - "Yesterday"')[0]).toEqual({ artist: 'The Beatles', title: 'Yesterday' })
  })

  test('collapses runs of whitespace left behind by stripping', () => {
    expect(guessSongs('The   Beatles  -  Yesterday   (HD)')[0]).toEqual({
      artist: 'The Beatles',
      title: 'Yesterday',
    })
  })

  test('a title with no separator is proposed as a title with no artist', () => {
    expect(guessSongs('Yesterday')).toEqual([{ artist: '', title: 'Yesterday' }])
  })

  test('a title that is nothing but noise proposes nothing', () => {
    expect(guessSongs('(Official Video) [HD]')).toEqual([])
  })

  test('nothing at all proposes nothing', () => {
    expect(guessSongs('   ')).toEqual([])
  })

  test('a repeated side is proposed once', () => {
    expect(guessSongs('Yesterday - Yesterday')).toEqual([{ artist: 'Yesterday', title: 'Yesterday' }])
  })

  test('an upload filename without a separator becomes the title', () => {
    expect(guessSongs('yesterday_final_mix')).toEqual([{ artist: '', title: 'yesterday_final_mix' }])
  })
})
