import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'
import { createLrclibProvider } from '../lyrics/lrclib'
import type { LyricsProvider } from '../lyrics/provider'

export interface PrestoOptions {
  /** Directory holding the database and every Track's files. */
  dataDir: string
  /** Folder of drizzle-kit generated SQL migrations. */
  migrationsDir: string
  /** The Lyrics Providers this instance can reach. Defaults to LRCLIB; tests pass fakes. */
  lyricsProviders?: LyricsProvider[]
}

export interface Presto {
  dataDir: string
  db: BetterSQLite3Database<typeof schema>
  /** The raw connection, for the rare statement drizzle cannot express. */
  sqlite: Database.Database
  lyricsProviders: readonly LyricsProvider[]
  close(): void
}

/**
 * Opens (creating if needed) the Presto data directory and database, applies
 * pending migrations, and returns the handle every route handler works
 * through. One instance per process in production; one per test in tests.
 */
export function createPresto(options: PrestoOptions): Presto {
  mkdirSync(options.dataDir, { recursive: true })
  const sqlite = new Database(join(options.dataDir, 'presto.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: options.migrationsDir })

  return {
    dataDir: options.dataDir,
    db,
    sqlite,
    lyricsProviders: options.lyricsProviders ?? [createLrclibProvider()],
    close() {
      sqlite.close()
    },
  }
}
