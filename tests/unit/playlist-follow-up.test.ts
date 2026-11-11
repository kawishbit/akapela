import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createAkapela, type Akapela } from '../../server/lib/akapela'
import type { JobContext } from '../../server/lib/jobs-runner'
import { playlistImportFollowUp } from '../../server/lib/playlist-imports'
import { createTrackFromPlaylistSong, createTrackFromPlaylistVideo, getTrack } from '../../server/lib/tracks'
import { getLyrics } from '../../server/lib/lyrics'
import { LyricsProviderError } from '../../server/lyrics/provider'
import { createFakeLyricsProvider, fakeSongMatch, type CannedLyricsProvider } from '../api/fake-lyrics-provider'

const LABEL = { id: 'p1', name: 'All Out 80s', separate: true }

let akapela: Akapela | undefined
let dataDir: string | undefined

afterEach(() => {
  akapela?.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  akapela = undefined
  dataDir = undefined
  vi.restoreAllMocks()
})

function setup(): { akapela: Akapela, lrclib: CannedLyricsProvider } {
  dataDir = mkdtempSync(join(tmpdir(), 'akapela-follow-up-'))
  const lrclib = createFakeLyricsProvider('lrclib')
  akapela = createAkapela({
    dataDir,
    migrationsDir: join(process.cwd(), 'server/db/migrations'),
    lyricsProviders: [lrclib.provider, createFakeLyricsProvider('genius').provider],
  })
  return { akapela, lrclib: lrclib.canned }
}

/** A Playlist Import's Track that has just finished importing. */
function importedTrack(app: Akapela, artist: string, title: string, label = LABEL) {
  const track = createTrackFromPlaylistSong(app, { artist, title, durationMs: 209_000 }, label)
  app.sqlite.prepare(`UPDATE tracks SET import_state = 'ready' WHERE id = ?`).run(track.id)
  return track
}

function ctxFor(job: NonNullable<ReturnType<typeof importedTrack>['job']>): JobContext {
  return {
    job,
    dataDir: dataDir!,
    sqlite: akapela!.sqlite,
    progress() {},
    detail() {},
    signal: new AbortController().signal,
  }
}

function separationJobs(app: Akapela, trackId: string) {
  return app.sqlite
    .prepare(`SELECT separation_model, playlist_import_id, playlist_import_name FROM jobs WHERE target_id = ? AND type = 'separate'`)
    .all(trackId)
}

describe('what a Playlist Import\'s Track gets once imported', () => {
  test('Lyrics searched without the edition note, the Song left as Spotify gave it, then a labelled Separation', async () => {
    const { akapela: app, lrclib } = setup()
    lrclib.songs = [fakeSongMatch('Queen', 'Don\'t Stop Me Now', { durationMs: 209_000 })]
    lrclib.lyrics = { 'don\'t stop me now': { kind: 'plain', lines: [{ text: 'Tonight I\'m gonna have myself' }] } }
    const track = importedTrack(app, 'Queen', 'Don\'t Stop Me Now - Remastered 2011')

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 209_000)

    expect(getLyrics(app, track.id)).toMatchObject({ provider: 'lrclib', kind: 'plain' })
    expect(getTrack(app, track.id)).toMatchObject({
      songArtist: 'Queen',
      songTitle: 'Don\'t Stop Me Now - Remastered 2011',
      songProviderIds: { lrclib: 'Queen:Don\'t Stop Me Now' },
      separationState: 'separating',
    })
    expect(separationJobs(app, track.id)).toEqual([
      { separation_model: 'Inst_Main', playlist_import_id: 'p1', playlist_import_name: 'All Out 80s' },
    ])
  })

  test('queues the Separation with the default Separation Model the singer chose', async () => {
    const { akapela: app } = setup()
    app.sqlite.prepare(`INSERT INTO settings (id, separation_model, updated_at) VALUES (1, 'Inst_HQ_3', 0)`).run()
    const track = importedTrack(app, 'a-ha', 'Take On Me')

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 225_000)

    expect(separationJobs(app, track.id)).toEqual([expect.objectContaining({ separation_model: 'Inst_HQ_3' })])
  })

  test('does not queue a second Separation when the singer asked for one meanwhile', async () => {
    const { akapela: app } = setup()
    const track = importedTrack(app, 'a-ha', 'Take On Me')
    app.sqlite.prepare(`UPDATE tracks SET separation_state = 'separating' WHERE id = ?`).run(track.id)

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 225_000)

    expect(separationJobs(app, track.id)).toEqual([])
  })

  test('a Lyrics Provider that fails leaves the Track ready without Lyrics, and still separates it', async () => {
    const { akapela: app, lrclib } = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    lrclib.searchError = new LyricsProviderError('lrclib', 'HTTP 503')
    const track = importedTrack(app, 'a-ha', 'Take On Me')

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 225_000)

    expect(getLyrics(app, track.id)).toBeNull()
    expect(getTrack(app, track.id)).toMatchObject({ importState: 'ready', separationState: 'separating' })
  })

  test('a Song the provider cannot find is fetched by artist and title, and is fine with none', async () => {
    const { akapela: app } = setup()
    const track = importedTrack(app, 'Nobody', 'Unknown - 2019 Mix')

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 200_000)

    expect(getLyrics(app, track.id)).toBeNull()
    expect(getTrack(app, track.id)?.songProviderIds).toEqual({})
  })

  test('does not separate when the singer turned that off, and still fetches Lyrics', async () => {
    const { akapela: app, lrclib } = setup()
    lrclib.songs = [fakeSongMatch('a-ha', 'Take On Me')]
    lrclib.lyrics = { 'take on me': { kind: 'plain', lines: [{ text: 'Talking away' }] } }
    const track = importedTrack(app, 'a-ha', 'Take On Me', { ...LABEL, separate: false })

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 225_000, null)

    expect(getLyrics(app, track.id)).toMatchObject({ provider: 'lrclib' })
    expect(getTrack(app, track.id)?.separationState).toBe('none')
    expect(separationJobs(app, track.id)).toEqual([])
  })

  test('tries the first of several artists alone when all of them together find nothing', async () => {
    const { akapela: app, lrclib } = setup()
    const searched: string[] = []
    lrclib.songs = [fakeSongMatch('Queen', 'Under Pressure')]
    const provider = app.lyricsProviders[0]!
    const search = provider.searchSongs.bind(provider)
    vi.spyOn(provider, 'searchSongs').mockImplementation(async (query) => {
      searched.push(query.artist)
      return query.artist === 'Queen' ? search(query) : []
    })
    const track = importedTrack(app, 'Queen, David Bowie', 'Under Pressure - Remastered 2011')

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 248_000)

    expect(searched).toEqual(['Queen, David Bowie', 'Queen'])
    expect(getTrack(app, track.id)?.songProviderIds).toEqual({ lrclib: 'Queen:Under Pressure' })
  })
})

describe('what a YouTube Playlist Import\'s Track gets once imported', () => {
  /** A video from a YouTube playlist that has just finished importing: no Song. */
  function importedVideo(app: Akapela, videoId = 'fJ9rUzIMcZQ', label = LABEL) {
    const track = createTrackFromPlaylistVideo(app, { videoId, title: 'Queen - Bohemian Rhapsody (Official Video)', durationMs: 354_000 }, label)
    app.sqlite.prepare(`UPDATE tracks SET import_state = 'ready' WHERE id = ?`).run(track.id)
    return track
  }

  test('confirms the Song YouTube names, then fetches its Lyrics and separates it', async () => {
    const { akapela: app, lrclib } = setup()
    lrclib.songs = [fakeSongMatch('Queen', 'Bohemian Rhapsody')]
    lrclib.lyrics = { 'bohemian rhapsody': { kind: 'plain', lines: [{ text: 'Is this the real life?' }] } }
    const track = importedVideo(app)

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 354_000, { artist: 'Queen', title: 'Bohemian Rhapsody' })

    expect(getTrack(app, track.id)).toMatchObject({
      title: 'Queen - Bohemian Rhapsody (Official Video)',
      artist: 'Queen',
      songArtist: 'Queen',
      songTitle: 'Bohemian Rhapsody',
      separationState: 'separating',
    })
    expect(getLyrics(app, track.id)).toMatchObject({ provider: 'lrclib' })
  })

  test('with no Song named, has no Song and no Lyrics, and is still separated', async () => {
    const { akapela: app, lrclib } = setup()
    lrclib.songs = [fakeSongMatch('Queen', 'Bohemian Rhapsody')]
    const track = importedVideo(app)

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 354_000, null)

    expect(getTrack(app, track.id)).toMatchObject({ songTitle: null, separationState: 'separating' })
    expect(getLyrics(app, track.id)).toBeNull()
  })

  test('leaves the Song off when another Track has it, and goes on without it', async () => {
    const { akapela: app } = setup()
    const first = importedVideo(app, 'fJ9rUzIMcZQ')
    const second = importedVideo(app, 'aaaaaaaaaaa')
    const song = { artist: 'Queen', title: 'Bohemian Rhapsody' }

    await playlistImportFollowUp(app)(ctxFor(first.job!), first.id, 354_000, song)
    await playlistImportFollowUp(app)(ctxFor(second.job!), second.id, 354_000, song)

    expect(getTrack(app, first.id)?.songTitle).toBe('Bohemian Rhapsody')
    expect(getTrack(app, second.id)).toMatchObject({ songTitle: null, importState: 'ready', separationState: 'separating' })
  })

  test('keeps a Song the Track already has, over the one YouTube names', async () => {
    const { akapela: app } = setup()
    const track = importedTrack(app, 'Queen', 'Bohemian Rhapsody - Remastered 2011')

    await playlistImportFollowUp(app)(ctxFor(track.job!), track.id, 354_000, { artist: 'Queen', title: 'Bohemian Rhapsody' })

    expect(getTrack(app, track.id)?.songTitle).toBe('Bohemian Rhapsody - Remastered 2011')
  })
})
