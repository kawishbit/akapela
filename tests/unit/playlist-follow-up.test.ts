import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createAkapela, type Akapela } from '../../server/lib/akapela'
import type { JobContext } from '../../server/lib/jobs-runner'
import { playlistImportFollowUp } from '../../server/lib/playlist-imports'
import { createTrackFromPlaylistSong, getTrack } from '../../server/lib/tracks'
import { getLyrics } from '../../server/lib/lyrics'
import { LyricsProviderError } from '../../server/lyrics/provider'
import { createFakeLyricsProvider, fakeSongMatch, type CannedLyricsProvider } from '../api/fake-lyrics-provider'

const LABEL = { id: 'p1', name: 'All Out 80s' }

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
function importedTrack(app: Akapela, artist: string, title: string) {
  const track = createTrackFromPlaylistSong(app, { artist, title, durationMs: 209_000 }, LABEL)
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
