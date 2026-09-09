import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as tar from 'tar'
import type { Akapela } from './akapela'

/**
 * Backup and restore: a WAL-checkpointed archive of everything that isn't
 * re-downloadable — the database and every Track's files — never `cache/`
 * (ticket 08, `.scratch/worker-to-typescript/`). `cache/` is excluded by
 * construction: the archive only ever lists `akapela.db` and `tracks/`, not
 * the data directory as a whole.
 */

const BACKUP_ENTRIES = ['akapela.db', 'tracks'] as const
const STAGING_DIRNAME = '.restore-staging'

export class BackupError extends Error {}

/**
 * Checkpoints the WAL (so the archive is never missing recently-committed
 * writes) and archives the database and every Track's files into a fresh
 * temp file. The caller deletes the containing directory once it is done
 * with the archive.
 */
export async function createBackupArchive(akapela: Akapela): Promise<string> {
  akapela.sqlite.pragma('wal_checkpoint(TRUNCATE)')
  const entries = BACKUP_ENTRIES.filter(name => existsSync(join(akapela.dataDir, name)))
  const dir = await mkdtemp(join(tmpdir(), 'akapela-backup-'))
  const archivePath = join(dir, 'akapela-backup.tar.gz')
  await tar.create({ gzip: true, file: archivePath, cwd: akapela.dataDir }, [...entries])
  return archivePath
}

/** Whether this library has any Track to lose — what decides whether a restore needs confirming first. */
export function hasLibraryData(akapela: Akapela): boolean {
  return akapela.sqlite.prepare(`SELECT 1 FROM tracks LIMIT 1`).get() !== undefined
}

/**
 * Extracts an uploaded archive into a staging area inside the data
 * directory — the same filesystem `applyStagedRestore` moves it from, so
 * that move is a rename rather than a copy. Validates it looks like an
 * Akapela backup; throws `BackupError` (safe to show the singer) rather
 * than replacing anything if it doesn't.
 */
export async function stageRestore(akapela: Akapela, archivePath: string): Promise<void> {
  const staging = join(akapela.dataDir, STAGING_DIRNAME)
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  try {
    await tar.extract({ file: archivePath, cwd: staging })
  }
  catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw new BackupError(
      `Could not read this file as a backup archive: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!existsSync(join(staging, 'akapela.db'))) {
    await rm(staging, { recursive: true, force: true })
    throw new BackupError('This file is not an Akapela backup: it has no database in it.')
  }
}

/**
 * Replaces the data directory's database and Track files with what
 * `stageRestore` staged, and closes the current database connection.
 *
 * Deliberately does not reopen one or restart the in-process Job runner —
 * both were built against the connection this just closed, and the caller
 * (`server/api/backup/restore.post.ts`) is responsible for the process
 * exiting afterward so a fresh one opens the restored files cleanly, the
 * same way `docker compose`'s `restart: unless-stopped` already expects a
 * process to come and go.
 */
export async function applyStagedRestore(akapela: Akapela): Promise<void> {
  const staging = join(akapela.dataDir, STAGING_DIRNAME)
  akapela.close()
  await rm(join(akapela.dataDir, 'akapela.db'), { force: true })
  await rm(join(akapela.dataDir, 'akapela.db-wal'), { force: true })
  await rm(join(akapela.dataDir, 'akapela.db-shm'), { force: true })
  await rm(join(akapela.dataDir, 'tracks'), { recursive: true, force: true })
  await rename(join(staging, 'akapela.db'), join(akapela.dataDir, 'akapela.db'))
  const stagedTracks = join(staging, 'tracks')
  if (existsSync(stagedTracks)) await rename(stagedTracks, join(akapela.dataDir, 'tracks'))
  await rm(staging, { recursive: true, force: true })
}
