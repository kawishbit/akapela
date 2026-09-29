import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { PlaylistError } from '../../server/lib/playlists'
import { failure } from '../../shared/error-codes'
import { createTestApi, type TestApi } from './harness'
import { spotifySong } from './fake-playlist-reader'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

const URL = 'https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe?si=abc'

const UNDER_PRESSURE = spotifySong('Queen, David Bowie', 'Under Pressure', 248_000)
const DONT_STOP = spotifySong('Queen', 'Don\'t Stop Me Now', 209_000)
const DONT_STOP_REMASTER = spotifySong('Queen', 'Don\'t Stop Me Now - Remastered 2011', 210_000)
const TAKE_ON_ME = spotifySong('a-ha', 'Take On Me', 225_000)

function servePlaylist(songs = [UNDER_PRESSURE, DONT_STOP, TAKE_ON_ME], name = 'All Out 80s') {
  api.spotify.playlist = { name, kind: 'playlist', total: songs.length, songs }
}

async function preview(url = URL) {
  return api.post('/api/playlist-imports/preview', { url })
}

async function start(serviceIds: string[], url = URL) {
  return api.post('/api/playlist-imports', { url, serviceIds })
}

/** A Track imported by hand, with a Song confirmed on it. */
async function trackWithSong(artist: string, title: string) {
  const track = await (await api.upload('/api/tracks', `${title}.mp3`, Buffer.from('ID3'))).json()
  expect((await api.confirmSong(track.id, { artist, title })).status).toBe(200)
  return track
}

function jobsLabelled(playlistImportId: string) {
  return api.akapela.sqlite
    .prepare(`SELECT id, type, target_id, state, playlist_import_name FROM jobs WHERE playlist_import_id = ? ORDER BY created_at, rowid`)
    .all(playlistImportId) as { id: string, type: string, target_id: string, state: string, playlist_import_name: string }[]
}

describe('previewing a Playlist Import', () => {
  test('lists the playlist\'s name, kind, total, and songs, each new', async () => {
    servePlaylist()

    const res = await preview()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ name: 'All Out 80s', kind: 'playlist', total: 3 })
    expect(body.songs).toEqual([
      { ...UNDER_PRESSURE, state: 'new' },
      { ...DONT_STOP, state: 'new' },
      { ...TAKE_ON_ME, state: 'new' },
    ])
    expect(api.spotify.reads).toEqual([{ service: 'spotify', kind: 'playlist', id: '37i9dQZF1DX4UtSsGT1Sbe' }])
  })

  test('a Song another Track has is in the Library, with that Track', async () => {
    servePlaylist()
    const existing = await trackWithSong('Queen', 'Don\'t Stop Me Now')

    const { songs } = await (await preview()).json()

    expect(songs[1]).toEqual({ ...DONT_STOP, state: 'inLibrary', trackId: existing.id })
    expect(songs[0].state).toBe('new')
  })

  test('a Song repeated in the playlist is a duplicate after its first time, and a remaster is not', async () => {
    const again = { ...DONT_STOP, serviceId: 'spotify:track:again' }
    servePlaylist([DONT_STOP, DONT_STOP_REMASTER, again])

    const { songs } = await (await preview()).json()

    expect(songs.map((song: { state: string }) => song.state)).toEqual(['new', 'new', 'duplicate'])
  })

  test('a link that is not a Spotify playlist or album is refused', async () => {
    const res = await preview('https://open.spotify.com/track/37i9dQZF1DX4UtSsGT1Sbe')

    expect(res.status).toBe(400)
    expect((await res.json()).data).toEqual(failure('invalidPlaylistLink'))
    expect(api.spotify.reads).toEqual([])
  })

  test.each([
    [new PlaylistError(failure('playlistTooLong', { total: 150 }), 'too long'), 422],
    [new PlaylistError(failure('playlistNotFound'), 'gone'), 404],
    [new PlaylistError(failure('playlistUnreadable'), 'changed'), 502],
  ])('passes the reader\'s refusal %s through with its code', async (error, status) => {
    api.spotify.error = error

    const res = await preview()

    expect(res.status).toBe(status)
    expect((await res.json()).data).toEqual(error.failure)
  })

  test('anything else going wrong reading the playlist is unexpected, with its English', async () => {
    api.spotify.error = new Error('Spotify answered HTTP 503')

    const res = await preview()

    expect(res.status).toBe(502)
    expect(res.statusText).toMatch(/HTTP 503/)
    expect((await res.json()).data.code).toBe('unexpected')
  })

  test('estimates from this install\'s own Separations with the default Separation Model', async () => {
    servePlaylist()
    const track = await (await api.upload('/api/tracks', 'x.mp3', Buffer.from('ID3'))).json()
    api.akapela.sqlite.prepare(`UPDATE tracks SET duration_ms = 200000 WHERE id = ?`).run(track.id)
    const separation = (model: string | null, startedAt: number, finishedAt: number, state = 'succeeded') =>
      api.akapela.sqlite
        .prepare(`INSERT INTO jobs (id, type, target_id, state, progress, created_at, started_at, finished_at, separation_model)
                  VALUES (?, 'separate', ?, ?, 100, ?, ?, ?, ?)`)
        .run(`${model}-${startedAt}`, track.id, state, startedAt, startedAt, finishedAt, model)
    separation('Inst_Main', 0, 100_000) // 0.5 per ms of audio
    separation(null, 1_000_000, 1_060_000) // 0.3, from before there was a choice
    separation('Inst_HQ_3', 2_000_000, 2_400_000) // another model: left out
    separation('Inst_Main', 3_000_000, 3_900_000, 'failed') // failed: left out

    const { separationMsPerAudioMs } = await (await preview()).json()

    expect(separationMsPerAudioMs).toBeCloseTo(0.4)
  })

  test('with no Separations to go on, estimates about 70 s per 4 minutes of audio', async () => {
    servePlaylist()

    expect((await (await preview()).json()).separationMsPerAudioMs).toBeCloseTo(70 / 240)
  })
})

describe('starting a Playlist Import', () => {
  test('makes a Track per chosen song, its Song confirmed, with one labelled import Job each', async () => {
    servePlaylist()

    const res = await start([UNDER_PRESSURE.serviceId, TAKE_ON_ME.serviceId])

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toEqual([])
    expect(body.created).toHaveLength(2)
    expect(body.created[0]).toMatchObject({
      title: 'Under Pressure',
      artist: 'Queen, David Bowie',
      songArtist: 'Queen, David Bowie',
      songTitle: 'Under Pressure',
      durationMs: 248_000,
      sourceKind: 'youtube',
      sourceRef: '',
      importState: 'importing',
    })
    const jobs = jobsLabelled(body.playlistImportId)
    expect(jobs.map(job => [job.type, job.target_id, job.playlist_import_name])).toEqual([
      ['import', body.created[0].id, 'All Out 80s'],
      ['import', body.created[1].id, 'All Out 80s'],
    ])

    const listed = await (await api.get('/api/jobs')).json()
    expect(listed.map((job: { lane: string }) => job.lane)).toEqual(['playlist', 'playlist'])
  })

  test('skips a song whose Song another Track has by now, and says so', async () => {
    servePlaylist()
    const existing = await trackWithSong('Queen', 'Don\'t Stop Me Now')

    const body = await (await start([DONT_STOP.serviceId, TAKE_ON_ME.serviceId])).json()

    expect(body.created.map((track: { title: string }) => track.title)).toEqual(['Take On Me'])
    expect(body.skipped).toEqual([{ ...DONT_STOP, trackId: existing.id }])
  })

  test('two imports of one playlist started together make each Track once', async () => {
    servePlaylist()
    const ids = [UNDER_PRESSURE.serviceId, DONT_STOP.serviceId, TAKE_ON_ME.serviceId]

    const [first, second] = await Promise.all([(await start(ids)).json(), (await start(ids)).json()])

    expect(first.created.length + second.created.length).toBe(3)
    expect(first.skipped.length + second.skipped.length).toBe(3)
    expect(api.akapela.sqlite.prepare(`SELECT count(*) AS n FROM tracks`).get()).toEqual({ n: 3 })
  })

  test('a song repeated in the playlist is made once', async () => {
    const again = { ...DONT_STOP, serviceId: 'spotify:track:again' }
    servePlaylist([DONT_STOP, again])

    const body = await (await start([DONT_STOP.serviceId, again.serviceId])).json()

    expect(body.created).toHaveLength(1)
    expect(body.skipped).toHaveLength(1)
  })

  test('reads the playlist again, and ignores ids it does not list', async () => {
    servePlaylist()

    const body = await (await start(['spotify:track:not-in-it', TAKE_ON_ME.serviceId])).json()

    expect(body.created.map((track: { title: string }) => track.title)).toEqual(['Take On Me'])
  })

  test.each([[{ url: URL }], [{ url: URL, serviceIds: [] }], [{ url: URL, serviceIds: [42] }]])(
    '%j is refused and creates nothing',
    async (body) => {
      servePlaylist()

      expect((await api.post('/api/playlist-imports', body)).status).toBe(400)
      expect(api.akapela.sqlite.prepare(`SELECT count(*) AS n FROM tracks`).get()).toEqual({ n: 0 })
    },
  )

  test('a refusal to read the playlist creates nothing', async () => {
    api.spotify.error = new PlaylistError(failure('playlistTooLong', { total: 150 }), 'too long')

    const res = await start([TAKE_ON_ME.serviceId])

    expect(res.status).toBe(422)
    expect(api.akapela.sqlite.prepare(`SELECT count(*) AS n FROM tracks`).get()).toEqual({ n: 0 })
  })

  test('cancelling one of its imports deletes that Track, which frees its Song', async () => {
    servePlaylist()
    const body = await (await start([TAKE_ON_ME.serviceId])).json()
    const [job] = jobsLabelled(body.playlistImportId)

    expect((await api.post(`/api/jobs/${job!.id}/cancel`, {})).status).toBe(200)

    expect((await api.get(`/api/tracks/${body.created[0].id}`)).status).toBe(404)
    const again = await (await start([TAKE_ON_ME.serviceId])).json()
    expect(again.created).toHaveLength(1)
  })

  test('a failed import retried from the Jobs page keeps its label and its Lane', async () => {
    servePlaylist()
    const body = await (await start([TAKE_ON_ME.serviceId])).json()
    const track = body.created[0]
    api.akapela.sqlite.prepare(`UPDATE tracks SET source_ref = 'https://www.youtube.com/watch?v=djV11Xbc914' WHERE id = ?`).run(track.id)
    api.failImport(track.id, track.job.id, 'HTTP Error 403')

    const retried = await (await api.post(`/api/jobs/${track.job.id}/retry`, {})).json()

    expect(retried).toMatchObject({ playlistImportId: body.playlistImportId, playlistImportName: 'All Out 80s' })
    const listed = await (await api.get('/api/jobs')).json()
    expect(listed.find((job: { id: string }) => job.id === retried.id).lane).toBe('playlist')
  })
})

describe('a Playlist Import\'s Track that found nothing on YouTube', () => {
  async function failedWithNoMatch() {
    servePlaylist()
    const body = await (await start([TAKE_ON_ME.serviceId])).json()
    const track = body.created[0]
    api.failImport(track.id, track.job.id, 'no YouTube result')
    return { track, playlistImportId: body.playlistImportId as string }
  }

  test('is retried from a link the singer pastes, keeping its Song and its label', async () => {
    const { track, playlistImportId } = await failedWithNoMatch()

    const res = await api.post(`/api/tracks/${track.id}/retry`, { url: 'https://youtu.be/djV11Xbc914' })

    expect(res.status).toBe(200)
    const retried = await res.json()
    expect(retried).toMatchObject({
      importState: 'importing',
      sourceRef: 'https://www.youtube.com/watch?v=djV11Xbc914',
      songTitle: 'Take On Me',
      job: { playlistImportId },
    })
  })

  test('asks for a link rather than searching again', async () => {
    const { track } = await failedWithNoMatch()

    const res = await api.post(`/api/tracks/${track.id}/retry`, {})

    expect(res.status).toBe(409)
    expect((await res.json()).data).toEqual(failure('youtubeLinkNeeded'))
    expect(api.jobsTargeting(track.id, 'import')).toHaveLength(1)
  })

  test('is not retried from the Jobs page, which has no link to give', async () => {
    const { track } = await failedWithNoMatch()

    const res = await api.post(`/api/jobs/${track.job.id}/retry`, {})

    expect(res.status).toBe(409)
    expect((await res.json()).data).toEqual(failure('youtubeLinkNeeded'))
  })

  test('refuses a link that is not one YouTube video', async () => {
    const { track } = await failedWithNoMatch()

    const res = await api.post(`/api/tracks/${track.id}/retry`, { url: 'https://open.spotify.com/track/x' })

    expect(res.status).toBe(400)
    expect((await res.json()).data).toEqual(failure('invalidYoutubeUrl'))
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).sourceRef).toBe('')
  })

  test('keeps its Song reserved until it is deleted', async () => {
    const { track } = await failedWithNoMatch()
    const other = await (await api.upload('/api/tracks', 'x.mp3', Buffer.from('ID3'))).json()

    expect((await api.confirmSong(other.id, { artist: 'a-ha', title: 'Take On Me' })).status).toBe(409)
    await api.del(`/api/tracks/${track.id}`)
    expect((await api.confirmSong(other.id, { artist: 'a-ha', title: 'Take On Me' })).status).toBe(200)
  })
})

describe('Cancel all', () => {
  test('cancels only that Playlist Import\'s unfinished Jobs, each the usual way', async () => {
    servePlaylist()
    const mine = await (await start([UNDER_PRESSURE.serviceId, DONT_STOP.serviceId, TAKE_ON_ME.serviceId])).json()
    const [done, separating, queued] = mine.created
    // One finished importing and is separating; one is still queued.
    api.finishImport(done.id, done.job.id)
    api.finishImport(separating.id, separating.job.id)
    const separation = (await (await api.post(`/api/tracks/${separating.id}/separate`, {})).json()).separationJob
    api.akapela.sqlite.prepare(`UPDATE jobs SET playlist_import_id = ?, playlist_import_name = 'All Out 80s' WHERE id = ?`)
      .run(mine.playlistImportId, separation.id)
    // Someone else's import, by hand.
    const byHand = await (await api.upload('/api/tracks', 'mine.mp3', Buffer.from('ID3'))).json()

    const res = await api.post(`/api/playlist-imports/${mine.playlistImportId}/cancel`, {})

    expect(await res.json()).toEqual({ cancelled: 2 })
    expect((await api.get(`/api/tracks/${queued.id}`)).status).toBe(404)
    expect(await (await api.get(`/api/tracks/${separating.id}`)).json()).toMatchObject({ separationState: 'none', importState: 'ready' })
    expect((await api.get(`/api/tracks/${done.id}`)).status).toBe(200)
    expect(await (await api.get(`/api/tracks/${byHand.id}`)).json()).toMatchObject({ importState: 'importing' })
  })

  test('keeps a Track that finished importing while its Job still fetches its Lyrics', async () => {
    servePlaylist()
    const mine = await (await start([TAKE_ON_ME.serviceId])).json()
    const track = mine.created[0]
    // Ready, with its import Job still running: the follow-up is looking its Lyrics up.
    api.akapela.sqlite.prepare(`UPDATE tracks SET import_state = 'ready' WHERE id = ?`).run(track.id)
    api.akapela.sqlite.prepare(`UPDATE jobs SET state = 'running' WHERE id = ?`).run(track.job.id)

    expect(await (await api.post(`/api/playlist-imports/${mine.playlistImportId}/cancel`, {})).json()).toEqual({ cancelled: 1 })

    expect(await (await api.get(`/api/tracks/${track.id}`)).json()).toMatchObject({ importState: 'ready' })
  })

  test('clearing finished Jobs takes the group\'s rows with them', async () => {
    servePlaylist()
    const mine = await (await start([TAKE_ON_ME.serviceId])).json()
    await api.post(`/api/playlist-imports/${mine.playlistImportId}/cancel`, {})

    await api.post('/api/jobs/clear', {})

    const listed = await (await api.get('/api/jobs')).json()
    expect(listed.filter((job: { playlistImportId: string | null }) => job.playlistImportId)).toEqual([])
  })
})
