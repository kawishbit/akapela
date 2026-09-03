import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { DEFAULT_ADJUSTMENTS, type Adjustments } from '../../shared/adjustments'

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
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type Track = typeof tracks.$inferSelect
