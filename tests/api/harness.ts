import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { createApp, createRouter, eventHandler, toNodeListener } from 'h3'
import { createPresto } from '../../server/lib/presto'
import type { SongMatch } from '../../server/lyrics/provider'
import jobsPost from '../../server/api/jobs.post'
import jobsIdGet from '../../server/api/jobs/[id].get'
import tracksPost from '../../server/api/tracks.post'
import tracksGet from '../../server/api/tracks.get'
import tracksIdGet from '../../server/api/tracks/[id].get'
import tracksIdDelete from '../../server/api/tracks/[id].delete'
import tracksIdRetryPost from '../../server/api/tracks/[id]/retry.post'
import tracksIdCoverGet from '../../server/api/tracks/[id]/cover.get'
import tracksIdBackingGet from '../../server/api/tracks/[id]/backing.get'
import tracksIdAdjustmentsPut from '../../server/api/tracks/[id]/adjustments.put'
import tracksIdSongsGet from '../../server/api/tracks/[id]/songs.get'
import tracksIdSongPut from '../../server/api/tracks/[id]/song.put'
import tracksIdLyricsOffsetPut from '../../server/api/tracks/[id]/lyrics-offset.put'
import tracksIdLyricsPost from '../../server/api/tracks/[id]/lyrics.post'
import tracksIdLyricsPut from '../../server/api/tracks/[id]/lyrics.put'
import tracksIdTakesGet from '../../server/api/tracks/[id]/takes.get'
import tracksIdTakesPost from '../../server/api/tracks/[id]/takes.post'
import tracksIdTakesTakeIdDelete from '../../server/api/tracks/[id]/takes/[takeId].delete'
import tracksIdTakesTakeIdPut from '../../server/api/tracks/[id]/takes/[takeId].put'
import tracksIdTakesTakeIdAudioGet from '../../server/api/tracks/[id]/takes/[takeId]/audio.get'
import tracksIdTakesTakeIdMixesGet from '../../server/api/tracks/[id]/takes/[takeId]/mixes.get'
import tracksIdTakesTakeIdMixesPost from '../../server/api/tracks/[id]/takes/[takeId]/mixes.post'
import tracksIdTakesTakeIdMixesMixIdDelete from '../../server/api/tracks/[id]/takes/[takeId]/mixes/[mixId].delete'
import tracksIdTakesTakeIdMixesMixIdAudioGet from '../../server/api/tracks/[id]/takes/[takeId]/mixes/[mixId]/audio.get'
import tracksIdTakesTakeIdMixesMixIdRetryPost from '../../server/api/tracks/[id]/takes/[takeId]/mixes/[mixId]/retry.post'
import settingsGet from '../../server/api/settings.get'
import settingsPut from '../../server/api/settings.put'
import { createFakeLyricsProvider } from './fake-lyrics-provider'
import { createFakeImages } from './fake-images'

/**
 * Boots the real route handlers on an in-process h3 app backed by a fresh
 * SQLite database and data directory in a temp folder. Mirrors what Nitro
 * does in production: the presto middleware sets `event.context.presto`,
 * then the file-based handlers run. The Lyrics Provider is a fake, so no test
 * touches the network.
 */
export async function createTestApi() {
  const dataDir = mkdtempSync(join(tmpdir(), 'presto-test-'))
  const lrclib = createFakeLyricsProvider('lrclib')
  const genius = createFakeLyricsProvider('genius')
  const images = createFakeImages()
  const presto = createPresto({
    dataDir,
    migrationsDir: join(process.cwd(), 'server/db/migrations'),
    lyricsProviders: [lrclib.provider, genius.provider],
    fetch: images.fetch,
  })

  const app = createApp()
  app.use(eventHandler((event) => {
    event.context.presto = presto
  }))
  const router = createRouter()
  router.post('/api/jobs', jobsPost)
  router.get('/api/jobs/:id', jobsIdGet)
  router.post('/api/tracks', tracksPost)
  router.get('/api/tracks', tracksGet)
  router.get('/api/tracks/:id', tracksIdGet)
  router.delete('/api/tracks/:id', tracksIdDelete)
  router.post('/api/tracks/:id/retry', tracksIdRetryPost)
  router.get('/api/tracks/:id/cover', tracksIdCoverGet)
  router.get('/api/tracks/:id/backing', tracksIdBackingGet)
  router.put('/api/tracks/:id/adjustments', tracksIdAdjustmentsPut)
  router.get('/api/tracks/:id/songs', tracksIdSongsGet)
  router.put('/api/tracks/:id/song', tracksIdSongPut)
  router.put('/api/tracks/:id/lyrics-offset', tracksIdLyricsOffsetPut)
  router.post('/api/tracks/:id/lyrics', tracksIdLyricsPost)
  router.put('/api/tracks/:id/lyrics', tracksIdLyricsPut)
  router.get('/api/tracks/:id/takes', tracksIdTakesGet)
  router.post('/api/tracks/:id/takes', tracksIdTakesPost)
  router.delete('/api/tracks/:id/takes/:takeId', tracksIdTakesTakeIdDelete)
  router.put('/api/tracks/:id/takes/:takeId', tracksIdTakesTakeIdPut)
  router.get('/api/tracks/:id/takes/:takeId/audio', tracksIdTakesTakeIdAudioGet)
  router.get('/api/tracks/:id/takes/:takeId/mixes', tracksIdTakesTakeIdMixesGet)
  router.post('/api/tracks/:id/takes/:takeId/mixes', tracksIdTakesTakeIdMixesPost)
  router.delete('/api/tracks/:id/takes/:takeId/mixes/:mixId', tracksIdTakesTakeIdMixesMixIdDelete)
  router.get('/api/tracks/:id/takes/:takeId/mixes/:mixId/audio', tracksIdTakesTakeIdMixesMixIdAudioGet)
  router.post('/api/tracks/:id/takes/:takeId/mixes/:mixId/retry', tracksIdTakesTakeIdMixesMixIdRetryPost)
  router.get('/api/settings', settingsGet)
  router.put('/api/settings', settingsPut)
  app.use(router)

  const server: Server = createServer(toNodeListener(app))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no port')
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    presto,
    dataDir,
    baseUrl,
    /** What the stand-in LRCLIB knows and what it was asked. */
    lyrics: lrclib.canned,
    /** The same for the stand-in Genius, which is where album art comes from. */
    genius: genius.canned,
    /** The album art the stand-in web answers with, and what was asked for. */
    images,
    get: (path: string) => fetch(baseUrl + path),
    post: (path: string, body: unknown) =>
      fetch(baseUrl + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    put: (path: string, body: unknown) =>
      fetch(baseUrl + path, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    del: (path: string) => fetch(baseUrl + path, { method: 'DELETE' }),
    /** Multipart upload of one file under the field name `file`. */
    upload: (path: string, filename: string, bytes: Uint8Array) => {
      const form = new FormData()
      form.append('file', new Blob([bytes]), filename)
      return fetch(baseUrl + path, { method: 'POST', body: form })
    },
    /** Uploads a Take: the WAV bytes under `file`, its metadata as JSON text under `meta`. */
    uploadTake: (trackId: string, bytes: Uint8Array, meta: Record<string, unknown>) => {
      const form = new FormData()
      form.append('file', new Blob([bytes]), 'take.wav')
      form.append('meta', JSON.stringify(meta))
      return fetch(`${baseUrl}/api/tracks/${trackId}/takes`, { method: 'POST', body: form })
    },
    /** Requests a Mix on a Take. */
    requestMix(trackId: string, takeId: string, body: unknown) {
      return this.post(`/api/tracks/${trackId}/takes/${takeId}/mixes`, body)
    },
    /** Retries a failed Mix's render. */
    retryMix(trackId: string, takeId: string, mixId: string) {
      return fetch(`${baseUrl}/api/tracks/${trackId}/takes/${takeId}/mixes/${mixId}/retry`, { method: 'POST' })
    },
    /** Confirms a Song on a Track, which is what gives the Track an artist. */
    confirmSong(
      trackId: string,
      song: Partial<SongMatch> & { artist: string, title: string, overwriteManual?: boolean },
    ) {
      return this.put(`/api/tracks/${trackId}/song`, song)
    },
    /** Stand in for the worker, which owns every state change after `queued`. */
    finishJob(id: string, state: 'succeeded' | 'failed', error: string | null = null) {
      presto.sqlite
        .prepare(`UPDATE jobs SET state = ?, progress = ?, error = ?, finished_at = ? WHERE id = ?`)
        .run(state, state === 'succeeded' ? 100 : 0, error, Date.now(), id)
    },
    /** Stand in for the worker's import job failing: it marks both the job and the Track. */
    failImport(trackId: string, jobId: string, error: string) {
      this.finishJob(jobId, 'failed', error)
      presto.sqlite.prepare(`UPDATE tracks SET import_state = 'failed' WHERE id = ?`).run(trackId)
    },
    /** Stand in for the worker's render job succeeding: it writes the Mix's file paths and finishes the job. */
    finishMix(mixId: string, jobId: string, paths: { mp3Path: string, wavPath?: string | null }) {
      presto.sqlite
        .prepare(`UPDATE mixes SET mp3_path = ?, wav_path = ?, updated_at = ? WHERE id = ?`)
        .run(paths.mp3Path, paths.wavPath ?? null, Date.now(), mixId)
      this.finishJob(jobId, 'succeeded')
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
      presto.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export type TestApi = Awaited<ReturnType<typeof createTestApi>>
