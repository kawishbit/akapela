import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'
import { createGeniusProvider } from '../lyrics/genius'
import { createLrclibProvider } from '../lyrics/lrclib'
import type { LyricsProvider } from '../lyrics/provider'

export interface AkapelaOptions {
  /** Directory holding the database and every Track's files. */
  dataDir: string
  /** Folder of drizzle-kit generated SQL migrations. */
  migrationsDir: string
  /** The Lyrics Providers this instance can reach. Defaults to LRCLIB and Genius; tests pass fakes. */
  lyricsProviders?: LyricsProvider[]
  /** Genius API token, from the environment. Without one the Genius provider is unavailable. */
  geniusToken?: string
  /** How this instance reaches the web outside a provider, which is cover art. Tests pass a stub. */
  fetch?: typeof globalThis.fetch
}

export interface Akapela {
  dataDir: string
  db: BetterSQLite3Database<typeof schema>
  /** The raw connection, for the rare statement drizzle cannot express. */
  sqlite: Database.Database
  lyricsProviders: readonly LyricsProvider[]
  /** Fetches things that belong to no provider, such as album art. */
  fetch: typeof globalThis.fetch
  close(): void
}

/**
 * Opens (creating if needed) the Akapela data directory and database, applies
 * pending migrations, and returns the handle every route handler works
 * through. One instance per process in production; one per test in tests.
 */
export function createAkapela(options: AkapelaOptions): Akapela {
  mkdirSync(options.dataDir, { recursive: true })
  const sqlite = new Database(join(options.dataDir, 'akapela.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: options.migrationsDir })

  return {
    dataDir: options.dataDir,
    db,
    sqlite,
    lyricsProviders: options.lyricsProviders
      ?? [createLrclibProvider(), createGeniusProvider({ token: options.geniusToken ?? '' })],
    fetch: options.fetch ?? ((...args) => globalThis.fetch(...args)),
    close() {
      sqlite.close()
    },
  }
}
