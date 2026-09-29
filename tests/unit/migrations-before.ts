import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MIGRATIONS = join(process.cwd(), 'server/db/migrations')

/**
 * A copy of the migrations as they stood before `tag`: everything up to, not
 * including, it. Every later migration goes too, since Drizzle applies only
 * migrations newer than the last one a database has, and a library upgraded
 * from before `tag` never had any of them. The caller removes the directory.
 */
export function migrationsBefore(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'akapela-migrations-'))
  cpSync(MIGRATIONS, dir, { recursive: true })
  const journalPath = join(dir, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number, tag: string }[] }
  const cut = journal.entries.find(entry => entry.tag === tag)
  if (!cut) throw new Error(`no migration ${tag}`)
  for (const entry of journal.entries.filter(entry => entry.idx >= cut.idx)) rmSync(join(dir, `${entry.tag}.sql`))
  journal.entries = journal.entries.filter(entry => entry.idx < cut.idx)
  writeFileSync(journalPath, JSON.stringify(journal))
  return dir
}
