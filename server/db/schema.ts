import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { DEFAULT_ADJUSTMENTS, type Adjustments } from '../../shared/adjustments'
import { DEFAULT_LYRICS_PROVIDER, LYRICS_KINDS, LYRICS_PROVIDERS, type LyricsLine } from '../../shared/lyrics'
import type { SongProviderIds } from '../../shared/song'

export const JOB_TYPES = ['noop', 'import'] as const
export type JobType = (typeof JOB_TYPES)[number]

export const JOB_STATES = ['queued', 'running', 'succeeded', 'failed'] as const
export type JobState = (typeof JOB_STATES)[number]

/**
 * Long-running work handed from the app to the worker. The app inserts rows
 * in `queued`; the worker claims them one at a time and owns every later
 * transition. See ADR 0002.
 */
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type', { enum: JOB_TYPES }).notNull(),
  targetId: text('target_id'),
  state: text('state', { enum: JOB_STATES }).notNull().default('queued'),
  progress: integer('progress').notNull().default(0),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
})

export type Job = typeof jobs.$inferSelect

export const SOURCE_KINDS = ['upload', 'youtube'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const IMPORT_STATES = ['importing', 'ready', 'failed'] as const
export type ImportState = (typeof IMPORT_STATES)[number]

/**
 * An entry in the library, created by importing one Source. Every file the
 * Track owns lives under `<dataDir>/tracks/<id>/`: the original Source audio
 * as delivered, the normalized Backing Track WAV, and the cover art.
 * Paths stored here are relative to that directory.
 */
export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist'),
  /** Duration of the Backing Track; null until the import has run. */
  durationMs: integer('duration_ms'),
  coverPath: text('cover_path'),
  sourceKind: text('source_kind', { enum: SOURCE_KINDS }).notNull(),
  /** The YouTube URL or the original upload's filename. */
  sourceRef: text('source_ref').notNull(),
  importState: text('import_state', { enum: IMPORT_STATES }).notNull().default('importing'),
  /** The last Adjustments used on this Track, restored when it is opened again. */
  adjustments: text('adjustments', { mode: 'json' })
    .$type<Adjustments>()
    .notNull()
    .default(DEFAULT_ADJUSTMENTS),
  /**
   * The confirmed Song, embedded because a Track has at most one. All four
   * columns are null together, until the singer confirms a match or types the
   * artist and title by hand.
   */
  songArtist: text('song_artist'),
  songTitle: text('song_title'),
  /** Per Lyrics Provider handle for fetching this Song again, keyed by provider name. */
  songProviderIds: text('song_provider_ids', { mode: 'json' }).$type<SongProviderIds>(),
  songAlbumArtUrl: text('song_album_art_url'),
  /**
   * The Lyrics Provider this Track's Lyrics are looked up in. Set from the
   * default when the Track is created and changed per Track afterwards, since
   * one Song may only be on Genius and the next only on LRCLIB. It becomes
   * Manual when the singer pastes or edits the words themselves.
   */
  lyricsProvider: text('lyrics_provider', { enum: LYRICS_PROVIDERS })
    .notNull()
    .default(DEFAULT_LYRICS_PROVIDER),
  /**
   * Shift applied to this Track's Lyrics, positive to hold them back for a
   * longer intro. Belongs to the Track rather than the Lyrics, so refetching
   * Lyrics leaves it alone.
   */
  lyricsOffsetMs: integer('lyrics_offset_ms').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type Track = typeof tracks.$inferSelect

/**
 * The Lyrics of one Track: at most one row per Track, replaced wholesale when
 * they are fetched again. `lines` holds the text in order, each with the song
 * time it is sung at when the Lyrics are Synced.
 */
export const lyrics = sqliteTable('lyrics', {
  trackId: text('track_id')
    .primaryKey()
    .references(() => tracks.id, { onDelete: 'cascade' }),
  provider: text('provider', { enum: LYRICS_PROVIDERS }).notNull(),
  kind: text('kind', { enum: LYRICS_KINDS }).notNull(),
  lines: text('lines', { mode: 'json' }).$type<LyricsLine[]>().notNull(),
  fetchedAt: integer('fetched_at').notNull(),
})

export type Lyrics = typeof lyrics.$inferSelect

/** The one settings row; Presto is one singer's app, so there is nothing to key them by. */
export const SETTINGS_ROW_ID = 1

/**
 * The choices that apply to the whole app rather than to one Track. Kept in
 * the database rather than the environment because the singer sets them from
 * the app, not the self-hoster from compose.
 */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  /** The Lyrics Provider new Tracks start out looking their Lyrics up in. */
  defaultLyricsProvider: text('default_lyrics_provider', { enum: LYRICS_PROVIDERS })
    .notNull()
    .default(DEFAULT_LYRICS_PROVIDER),
  updatedAt: integer('updated_at').notNull(),
})

export type Settings = typeof settings.$inferSelect
