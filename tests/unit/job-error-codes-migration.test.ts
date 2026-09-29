import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createAkapela } from '../../server/lib/akapela'
import { listJobs } from '../../server/lib/job-actions'
import { describeJobFailure } from '../../app/utils/errors'
import { englishTranslate } from './i18n'

const MIGRATIONS = join(process.cwd(), 'server/db/migrations')
const CODES_MIGRATION = '0022_job_error_codes'

const cleanup: string[] = []
afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The migrations as they stood before Jobs had codes: everything up to, not including, 0022. */
function migrationsBeforeCodes(): string {
  const dir = mkdtempSync(join(tmpdir(), 'akapela-migrations-'))
  cleanup.push(dir)
  cpSync(MIGRATIONS, dir, { recursive: true })
  rmSync(join(dir, `${CODES_MIGRATION}.sql`))
  const journalPath = join(dir, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag !== CODES_MIGRATION)
  writeFileSync(journalPath, JSON.stringify(journal))
  return dir
}

test('a library with failed Jobs from before codes upgrades, and they read as unexpected with their old text', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'akapela-upgrade-'))
  cleanup.push(dataDir)

  const before = createAkapela({ dataDir, migrationsDir: migrationsBeforeCodes() })
  before.sqlite
    .prepare(`INSERT INTO jobs (id, type, state, progress, error, created_at, finished_at) VALUES (?, 'noop', 'failed', 0, ?, 1, 2)`)
    .run('old', 'SourceError: yt-dlp exploded')
  before.close()

  const after = createAkapela({ dataDir, migrationsDir: MIGRATIONS })
  const [job] = listJobs(after)
  after.close()

  expect(job).toMatchObject({ id: 'old', error: 'SourceError: yt-dlp exploded', errorCode: null, errorParams: null })
  expect(describeJobFailure(job!, englishTranslate()))
    .toEqual({ message: 'Something went wrong.', details: 'SourceError: yt-dlp exploded' })
})
