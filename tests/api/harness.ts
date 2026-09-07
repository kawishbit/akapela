import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { createApp, createRouter, eventHandler, toNodeListener } from 'h3'
import { createAkapela } from '../../server/lib/akapela'
import { traceRequestAs } from '../../server/lib/request-trace'
import type { SongMatch } from '../../server/lyrics/provider'
import type { BrowserLogEntry } from '../../shared/browser-log'
import jobsPost from '../../server/api/jobs.post'
import jobsIdGet from '../../server/api/jobs/[id].get'
import tracksPost from '../../server/api/tracks.post'
import tracksGet from '../../server/api/tracks.get'
import tracksIdGet from '../../server/api/tracks/[id].get'
import tracksIdDelete from '../../server/api/tracks/[id].delete'
import tracksIdRetryPost from '../../server/api/tracks/[id]/retry.post'
import tracksIdSeparatePost from '../../server/api/tracks/[id]/separate.post'
import tracksIdSeparateRetryPost from '../../server/api/tracks/[id]/separate/retry.post'
import tracksIdStemsDelete from '../../server/api/tracks/[id]/stems.delete'
import tracksIdCoverGet from '../../server/api/tracks/[id]/cover.get'
import tracksIdBackingGet from '../../server/api/tracks/[id]/backing.get'
import tracksIdBackingSourcePut from '../../server/api/tracks/[id]/backing-source.put'
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
import telemetryBrowserPost from '../../server/api/telemetry/browser.post'
import settingsGet from '../../server/api/settings.get'
import settingsPut from '../../server/api/settings.put'
import { createFakeLyricsProvider } from './fake-lyrics-provider'
import { createFakeImages } from './fake-images'

/**
 * Ports Node's `fetch` refuses to connect to at all, failing with `bad port`
 * before a request is ever made — the WHATWG bad-port list, as implemented by
 * undici. Only a handful can land in an ephemeral range, but this machine's
 * range does drift through them, and when it does an unrelated test fails with
 * a message about a port. Asking for another one is cheaper than explaining
 * that every time.
 */
const PORTS_FETCH_REFUSES = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  138, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531,
  532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720,
  1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
])

async function listenOnAPortFetchWillTalkTo(server: Server): Promise<number> {
  for (;;) {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    if (!PORTS_FETCH_REFUSES.has(address.port)) return address.port
    await new Promise<void>((resolve, reject) => server.close(e => (e ? reject(e) : resolve())))
  }
}

/**
 * Boots the real route handlers on an in-process h3 app backed by a fresh
 * SQLite database and data directory in a temp folder. Mirrors what Nitro
 * does in production: the akapela middleware sets `event.context.akapela`,
 * then the file-based handlers run. The Lyrics Provider is a fake, so no test
 * touches the network.
 */
export async function createTestApi() {
  const dataDir = mkdtempSync(join(tmpdir(), 'akapela-test-'))
  const lrclib = createFakeLyricsProvider('lrclib')
  const genius = createFakeLyricsProvider('genius')
  const images = createFakeImages()
  const akapela = createAkapela({
    dataDir,
    migrationsDir: join(process.cwd(), 'server/db/migrations'),
    lyricsProviders: [lrclib.provider, genius.provider],
    fetch: images.fetch,
  })

  // Telemetry is off in every real test run, so the relay's sink stands in for
  // the one the dev-only Nitro plugin installs.
  let browserLogs: BrowserLogEntry[] | null = []
  let traceParent: string | null = null

  const app = createApp()
  app.use(eventHandler((event) => {
    event.context.akapela = akapela
    // Where the telemetry plugin marks the request; the same call, so what is
    // under test is the real mechanism and not a stand-in for it — including
    // emptying the store once the response is out, which is the whole point of
    // the store being a box rather than a string.
    if (traceParent !== null) event.node.res.on('close', traceRequestAs(traceParent))
    if (browserLogs !== null) {
      const collected = browserLogs
      event.context.recordBrowserLogs = entries => collected.push(...entries)
    }
  }))
  const router = createRouter()
  router.post('/api/jobs', jobsPost)
  router.get('/api/jobs/:id', jobsIdGet)
  router.post('/api/tracks', tracksPost)
  router.get('/api/tracks', tracksGet)
  router.get('/api/tracks/:id', tracksIdGet)
  router.delete('/api/tracks/:id', tracksIdDelete)
  router.post('/api/tracks/:id/retry', tracksIdRetryPost)
  router.post('/api/tracks/:id/separate', tracksIdSeparatePost)
  router.post('/api/tracks/:id/separate/retry', tracksIdSeparateRetryPost)
  router.delete('/api/tracks/:id/stems', tracksIdStemsDelete)
  router.get('/api/tracks/:id/cover', tracksIdCoverGet)
  router.get('/api/tracks/:id/backing', tracksIdBackingGet)
  router.put('/api/tracks/:id/backing-source', tracksIdBackingSourcePut)
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
  router.post('/api/telemetry/browser', telemetryBrowserPost)
  router.get('/api/settings', settingsGet)
  router.put('/api/settings', settingsPut)
  app.use(router)

  const server: Server = createServer(toNodeListener(app))
  const baseUrl = `http://127.0.0.1:${await listenOnAPortFetchWillTalkTo(server)}`

  return {
    akapela,
    dataDir,
    baseUrl,
    /** Traces every later request, the way the telemetry plugin does under the AppHost. */
    traceRequestsAs(value: string) {
      traceParent = value
    },
    /** The trace stamped on a Job row, which is what the worker reads. */
    jobTraceParent(jobId: string): string | null {
      const row = akapela.sqlite.prepare(`SELECT trace_parent FROM jobs WHERE id = ?`).get(jobId)
      return (row as { trace_parent: string | null } | undefined)?.trace_parent ?? null
    },
    /** What the browser has relayed through `/api/telemetry/browser`. */
    get browserLogs() {
      return browserLogs ?? []
    },
    /** Puts the relay back where it is outside the AppHost: nothing listening. */
    stopRecordingBrowserLogs() {
      browserLogs = null
    },
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
      akapela.sqlite
        .prepare(`UPDATE jobs SET state = ?, progress = ?, error = ?, finished_at = ? WHERE id = ?`)
        .run(state, state === 'succeeded' ? 100 : 0, error, Date.now(), id)
    },
    /** Stand in for the worker's import job succeeding: it marks both the job and the Track. */
    finishImport(trackId: string, jobId: string) {
      this.finishJob(jobId, 'succeeded')
      akapela.sqlite.prepare(`UPDATE tracks SET import_state = 'ready' WHERE id = ?`).run(trackId)
    },
    /** Stand in for the worker's import job failing: it marks both the job and the Track. */
    failImport(trackId: string, jobId: string, error: string) {
      this.finishJob(jobId, 'failed', error)
      akapela.sqlite.prepare(`UPDATE tracks SET import_state = 'failed' WHERE id = ?`).run(trackId)
    },
    /**
     * Stand in for the worker's separate job ending: it marks the job and moves
     * the Track's `separation_state` on, which is the worker's to own the way
     * `import_state` is. A separation that succeeds also flips the Track onto
     * the Instrumental Stem it just wrote, so the common case takes no extra
     * tap; `worker/tests/test_separate.py` is what proves the real job does it.
     */
    finishSeparation(trackId: string, jobId: string, state: 'succeeded' | 'failed', error: string | null = null) {
      this.finishJob(jobId, state, error)
      if (state === 'succeeded') {
        akapela.sqlite
          .prepare(`UPDATE tracks SET separation_state = 'ready', backing_source = 'instrumental' WHERE id = ?`)
          .run(trackId)
      }
      else {
        akapela.sqlite.prepare(`UPDATE tracks SET separation_state = 'failed' WHERE id = ?`).run(trackId)
      }
    },
    /** Every Job of one type queued against a target, so a route that must not queue a second can say so. */
    jobsTargeting(targetId: string, type: string) {
      return akapela.sqlite
        .prepare(`SELECT id FROM jobs WHERE target_id = ? AND type = ?`)
        .all(targetId, type) as { id: string }[]
    },
    /** Stand in for the worker's render job succeeding: it writes the Mix's file paths and finishes the job. */
    finishMix(mixId: string, jobId: string, paths: { mp3Path: string, wavPath?: string | null }) {
      akapela.sqlite
        .prepare(`UPDATE mixes SET mp3_path = ?, wav_path = ?, updated_at = ? WHERE id = ?`)
        .run(paths.mp3Path, paths.wavPath ?? null, Date.now(), mixId)
      this.finishJob(jobId, 'succeeded')
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
      akapela.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export type TestApi = Awaited<ReturnType<typeof createTestApi>>
