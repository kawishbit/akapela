import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { createApp, createRouter, eventHandler, toNodeListener } from 'h3'
import { createPresto } from '../../server/lib/presto'
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

/**
 * Boots the real route handlers on an in-process h3 app backed by a fresh
 * SQLite database and data directory in a temp folder. Mirrors what Nitro
 * does in production: the presto middleware sets `event.context.presto`,
 * then the file-based handlers run.
 */
export async function createTestApi() {
  const dataDir = mkdtempSync(join(tmpdir(), 'presto-test-'))
  const presto = createPresto({
    dataDir,
    migrationsDir: join(process.cwd(), 'server/db/migrations'),
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
    /** Stand in for Song confirmation (a later ticket), which is what gives a Track an artist. */
    setArtist(trackId: string, artist: string) {
      presto.sqlite.prepare(`UPDATE tracks SET artist = ? WHERE id = ?`).run(artist, trackId)
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
    async close() {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
      presto.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export type TestApi = Awaited<ReturnType<typeof createTestApi>>
