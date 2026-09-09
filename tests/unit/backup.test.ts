import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyStagedRestore, BackupError, createBackupArchive, hasLibraryData, stageRestore } from '../../server/lib/backup'
import { createAkapela, type Akapela } from '../../server/lib/akapela'

const MIGRATIONS_DIR = join(process.cwd(), 'server/db/migrations')

const dirsToClean: string[] = []
const akapelasToClose: Akapela[] = []

function open(dataDir?: string): Akapela {
  const dir = dataDir ?? mkdtempSync(join(tmpdir(), 'akapela-backup-test-'))
  if (!dataDir) dirsToClean.push(dir)
  const akapela = createAkapela({ dataDir: dir, migrationsDir: MIGRATIONS_DIR })
  akapelasToClose.push(akapela)
  return akapela
}

afterEach(() => {
  for (const akapela of akapelasToClose) {
    try {
      akapela.close()
    }
    catch {
      // already closed by the code under test — expected for the restore target
    }
  }
  akapelasToClose.length = 0
  for (const dir of dirsToClean) rmSync(dir, { recursive: true, force: true })
  dirsToClean.length = 0
})

function insertTrack(akapela: Akapela, id: string, title: string): void {
  akapela.sqlite
    .prepare(
      `INSERT INTO tracks (id, title, artist, duration_ms, cover_path, source_kind, source_ref,
        import_state, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, 'cover.svg', 'upload', 'sine.wav', 'ready', 1000, 1000)`,
    )
    .run(id, title)
}

function trackTitles(akapela: Akapela): string[] {
  return (akapela.sqlite.prepare(`SELECT title FROM tracks ORDER BY title`).all() as { title: string }[])
    .map(row => row.title)
}

describe('backup and restore round trip', () => {
  it('restores exactly what was backed up, replacing what was there before', async () => {
    const source = open()
    insertTrack(source, 't1', 'Track One')
    insertTrack(source, 't2', 'Track Two')
    const t1Dir = join(source.dataDir, 'tracks', 't1')
    mkdirSync(t1Dir, { recursive: true })
    writeFileSync(join(t1Dir, 'backing.wav'), 'not really audio, just bytes to move')

    const archivePath = await createBackupArchive(source)
    expect(existsSync(archivePath)).toBe(true)

    const target = open()
    insertTrack(target, 'stale', 'Should Be Replaced')
    expect(trackTitles(target)).toEqual(['Should Be Replaced'])

    await stageRestore(target, archivePath)
    await applyStagedRestore(target)

    // applyStagedRestore closed target's connection; open a fresh one against
    // the same (now restored) data directory, the way the real process
    // restart the API route triggers would.
    const reopened = open(target.dataDir)
    expect(trackTitles(reopened)).toEqual(['Track One', 'Track Two'])
    expect(readFileSync(join(target.dataDir, 'tracks', 't1', 'backing.wav'), 'utf8'))
      .toBe('not really audio, just bytes to move')
  })

  it('excludes cache/ from the backup', async () => {
    const source = open()
    insertTrack(source, 't1', 'Track One')
    const cacheDir = join(source.dataDir, 'cache', 'models')
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(join(cacheDir, 'model.onnx'), 'pretend model weights')

    const archivePath = await createBackupArchive(source)

    const target = open()
    await stageRestore(target, archivePath)
    await applyStagedRestore(target)

    expect(existsSync(join(target.dataDir, 'cache'))).toBe(false)
  })

  it('checkpoints the WAL before archiving, so a recent write is never missing', async () => {
    const source = open()
    // A write that only exists in the WAL until checkpointed.
    insertTrack(source, 't1', 'Just Written')

    const archivePath = await createBackupArchive(source)

    const target = open()
    await stageRestore(target, archivePath)
    await applyStagedRestore(target)
    const reopened = open(target.dataDir)

    expect(trackTitles(reopened)).toEqual(['Just Written'])
  })

  it('rejects a file that is not a tar archive at all', async () => {
    const target = open()
    const dir = mkdtempSync(join(tmpdir(), 'akapela-backup-bad-'))
    dirsToClean.push(dir)
    const notAnArchive = join(dir, 'not-a-backup.tar.gz')
    writeFileSync(notAnArchive, 'this is plainly not a tar.gz file')

    await expect(stageRestore(target, notAnArchive)).rejects.toBeInstanceOf(BackupError)
  })

  it('rejects a real archive with no database in it', async () => {
    const target = open()
    const innocent = open()
    mkdirSync(join(innocent.dataDir, 'tracks', 't1'), { recursive: true })
    writeFileSync(join(innocent.dataDir, 'tracks', 't1', 'backing.wav'), 'audio')
    // Archive tracks/ only — no akapela.db — by hand, standing in for a
    // corrupt or unrelated tar.gz someone tries to restore from.
    const tar = await import('tar')
    const archiveDir = mkdtempSync(join(tmpdir(), 'akapela-backup-notrace-'))
    dirsToClean.push(archiveDir)
    const archivePath = join(archiveDir, 'no-db.tar.gz')
    await tar.create({ gzip: true, file: archivePath, cwd: innocent.dataDir }, ['tracks'])

    await expect(stageRestore(target, archivePath)).rejects.toThrow(/no database/)
  })

  it('reports whether the library has anything to lose', () => {
    const akapela = open()
    expect(hasLibraryData(akapela)).toBe(false)
    insertTrack(akapela, 't1', 'A Track')
    expect(hasLibraryData(akapela)).toBe(true)
  })
})
