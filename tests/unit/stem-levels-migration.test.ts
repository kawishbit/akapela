import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createAkapela } from '../../server/lib/akapela'
import { migrationsBefore } from './migrations-before'

const MIGRATIONS = join(process.cwd(), 'server/db/migrations')
const STEM_LEVELS_MIGRATION = '0024_stem_levels'

const cleanup: string[] = []
afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The migrations as they stood before Stem Levels: everything up to, not including, 0024. */
function migrationsBeforeStemLevels(): string {
  const dir = migrationsBefore(STEM_LEVELS_MIGRATION)
  cleanup.push(dir)
  return dir
}

test('every instrumental Track, Take, and Mix becomes Stems at 0/100, and original ones are left alone', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'akapela-upgrade-'))
  cleanup.push(dataDir)

  const before = createAkapela({ dataDir, migrationsDir: migrationsBeforeStemLevels() })
  const insertTrack = before.sqlite.prepare(
    `INSERT INTO tracks (id, title, source_kind, source_ref, import_state, backing_source, created_at, updated_at)
     VALUES (?, 'Song', 'upload', 'song.wav', 'ready', ?, 1, 1)`,
  )
  const insertTake = before.sqlite.prepare(
    `INSERT INTO takes (id, track_id, start_position_ms, duration_ms, file_path, adjustments, backing_source, created_at, updated_at)
     VALUES (?, ?, 0, 1000, 'takes/x.wav', '{}', ?, 1, 1)`,
  )
  const insertMix = before.sqlite.prepare(
    `INSERT INTO mixes (id, take_id, pitch_semitones, tempo_percent, linked, backing_source, latency_nudge_ms,
       vocal_gain, backing_gain, job_id, created_at, updated_at)
     VALUES (?, ?, 0, 100, 0, ?, 0, 1, 1, 'j', 1, 1)`,
  )
  for (const source of ['original', 'instrumental']) {
    insertTrack.run(`track-${source}`, source)
    insertTake.run(`take-${source}`, `track-${source}`, source)
    insertMix.run(`mix-${source}`, `take-${source}`, source)
  }
  before.close()

  const after = createAkapela({ dataDir, migrationsDir: MIGRATIONS })
  const rows = (table: string) => after.sqlite
    .prepare(`SELECT id, backing_source, stem_levels FROM ${table} ORDER BY id`)
    .all() as { id: string, backing_source: string, stem_levels: string }[]
  const tracks = rows('tracks')
  const takes = rows('takes')
  const mixes = rows('mixes')
  after.close()

  for (const table of [tracks, takes, mixes]) {
    expect(table.map(row => row.backing_source)).toEqual(['stems', 'original'])
    for (const row of table) expect(JSON.parse(row.stem_levels)).toEqual({ guideVocal: 0, instrumental: 1 })
  }
})
