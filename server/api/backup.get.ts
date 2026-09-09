import { createReadStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { defineEventHandler, sendStream, setResponseHeaders } from 'h3'
import { createBackupArchive } from '../lib/backup'

/** Downloads a WAL-checkpointed backup archive: the database and every Track's files, never `cache/`. */
export default defineEventHandler(async (event) => {
  const archivePath = await createBackupArchive(event.context.akapela)
  const stamp = new Date().toISOString().slice(0, 10)
  setResponseHeaders(event, {
    'content-type': 'application/gzip',
    'content-disposition': `attachment; filename="akapela-backup-${stamp}.tar.gz"`,
  })
  const stream = createReadStream(archivePath)
  // The archive lives in a temp directory made just for it; clean it up once
  // it has actually been read, not before — a stream error leaves it for the
  // next request to trip over rather than deleting out from under a slow client.
  const cleanup = () => { rm(dirname(archivePath), { recursive: true, force: true }).catch(() => {}) }
  stream.on('close', cleanup)
  stream.on('error', cleanup)
  return sendStream(event, stream)
})
