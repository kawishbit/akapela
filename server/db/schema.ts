import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { DEFAULT_ADJUSTMENTS, LOWPASS_HZ_MAX, REVERB_AMOUNT_MIN, type Adjustments } from '../../shared/adjustments'
import { BACKING_SOURCES, DEFAULT_BACKING_SOURCE } from '../../shared/backing-source'
import { DEFAULT_LYRICS_PROVIDER, LYRICS_KINDS, LYRICS_PROVIDERS, type LyricsLine } from '../../shared/lyrics'
import type { SongProviderIds } from '../../shared/song'

export const JOB_TYPES = ['noop', 'import', 'render', 'separate'] as const
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
  /**
   * W3C `traceparent` of the request that enqueued this Job, so the worker's
   * span for running it hangs off that request's trace rather than starting a
   * new one. Null whenever nothing was tracing, which is every run outside the
   * AppHost. Telemetry only; nothing reads it to decide anything.
   */
  traceParent: text('trace_parent'),
})

export type Job = typeof jobs.$inferSelect

export const SOURCE_KINDS = ['upload', 'youtube'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const IMPORT_STATES = ['importing', 'ready', 'failed'] as const
export type ImportState = (typeof IMPORT_STATES)[number]

export const SEPARATION_STATES = ['none', 'separating', 'ready', 'failed'] as const
export type SeparationState = (typeof SEPARATION_STATES)[number]

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
  /**
   * How far vocal removal has got on this Track, mirroring `import_state`. The
   * separate Job carries the mechanics — its progress, its error, when it
   * started — and is gone as soon as the Track is deleted; this carries what a
   * card renders, which has to survive being read without joining the Job and
   * has to distinguish a Track that has Stems from one nobody has asked to
   * separate. `none` until the singer asks, and back to `none` when the Stems
   * are deleted.
   */
  separationState: text('separation_state', { enum: SEPARATION_STATES }).notNull().default('none'),
  /**
   * Which of this Track's audio files is the Backing Track. `original` until a
   * separation succeeds and flips it to `instrumental`, so the common case
   * takes no extra tap, and switchable back at any time because separation is
   * lossy and sometimes loses — a Track imported from a karaoke video often
   * sounds better on the audio it arrived with than on anything a model
   * extracts from it. Delete Stems (ticket 04) will put it back to `original`.
   */
  backingSource: text('backing_source', { enum: BACKING_SOURCES }).notNull().default(DEFAULT_BACKING_SOURCE),
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

/**
 * One recorded attempt at singing a Track: the dry vocal WAV, where in the
 * Backing Track it started, and the Adjustments it was sung to. Latency nudge
 * and the gain pair default to no correction and unity until the Review
 * screen (ticket 08) lets the singer set them.
 */
export const takes = sqliteTable('takes', {
  id: text('id').primaryKey(),
  trackId: text('track_id')
    .notNull()
    .references(() => tracks.id, { onDelete: 'cascade' }),
  /** Song position, in milliseconds, the Backing Track was at when this Take began. */
  startPositionMs: integer('start_position_ms').notNull(),
  durationMs: integer('duration_ms').notNull(),
  /** Relative to the Track directory (`../lib/tracks#trackDir`). */
  filePath: text('file_path').notNull(),
  /** What was heard while singing, so a rendered Mix reproduces it. */
  adjustments: text('adjustments', { mode: 'json' }).$type<Adjustments>().notNull(),
  /**
   * The Backing Source in force when this Take was sung, fixed at record time
   * and never changed afterwards — unlike a Mix's own, which may override it.
   * Defaults to `original` so every phase-one Take, sung before Stems existed,
   * keeps meaning what it meant (ADR 0003 amendment).
   */
  backingSource: text('backing_source', { enum: BACKING_SOURCES }).notNull().default(DEFAULT_BACKING_SOURCE),
  /** Vocal delay correction in milliseconds, set on the Review screen. */
  latencyNudgeMs: integer('latency_nudge_ms').notNull().default(0),
  /** Linear gain multipliers applied at Mix render; 1 is unity. */
  vocalGain: real('vocal_gain').notNull().default(1),
  backingGain: real('backing_gain').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type Take = typeof takes.$inferSelect

/**
 * A rendered export of one Take: its vocal placed at the Take's start
 * position (plus nudge) over the full, Adjustments-applied Backing Track.
 * `mp3Path` and `wavPath` are null until the worker's render job finishes;
 * `wavRequested` records whether a WAV was asked for, since `wavPath` alone
 * cannot distinguish "not requested" from "still rendering". Every render
 * parameter is copied onto the row at request time so a later re-render (a
 * fresh Mix, ticket 09) never changes what an existing Mix reproduces.
 * Tempo always equals the Take's own — locked, never requested (ADR 0003).
 */
export const mixes = sqliteTable('mixes', {
  id: text('id').primaryKey(),
  takeId: text('take_id')
    .notNull()
    .references(() => takes.id, { onDelete: 'cascade' }),
  /** Relative to the Track directory (`../lib/tracks#trackDir`), set once the render succeeds. */
  mp3Path: text('mp3_path'),
  wavPath: text('wav_path'),
  wavRequested: integer('wav_requested', { mode: 'boolean' }).notNull().default(false),
  pitchSemitones: integer('pitch_semitones').notNull(),
  tempoPercent: integer('tempo_percent').notNull(),
  linked: integer('linked', { mode: 'boolean' }).notNull(),
  /** The two Effects, copied onto the row at request time like every other render parameter (ticket 07). */
  reverbAmount: integer('reverb_amount').notNull().default(REVERB_AMOUNT_MIN),
  lowpassHz: integer('lowpass_hz').notNull().default(LOWPASS_HZ_MAX),
  /**
   * Which audio this Mix was rendered against, copied onto the row at request
   * time and defaulting to the Take's own — a request may override it, so
   * singing along to the original with the real singer audible can still
   * render a Mix against the Instrumental Stem (ADR 0003 amendment).
   */
  backingSource: text('backing_source', { enum: BACKING_SOURCES }).notNull().default(DEFAULT_BACKING_SOURCE),
  latencyNudgeMs: integer('latency_nudge_ms').notNull(),
  vocalGain: real('vocal_gain').notNull(),
  backingGain: real('backing_gain').notNull(),
  /** The render Job that produces this Mix's files. */
  jobId: text('job_id').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type Mix = typeof mixes.$inferSelect

/**
 * A named bundle of Adjustments, one tap to apply (ticket 08). Carries the
 * five Adjustments fields and nothing Track-specific — not Backing Source,
 * not Lyrics Offset, not the gains a Take does not exist yet to have — which
 * is what lets applying one be a single assignment onto any Track. The three
 * built-ins (Slowed and Reverb, Nightcore, Practice) are seeded by the
 * migration with `built_in = 1`; deleting one is rejected.
 */
export const presets = sqliteTable('presets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  pitchSemitones: integer('pitch_semitones').notNull(),
  tempoPercent: integer('tempo_percent').notNull(),
  linked: integer('linked', { mode: 'boolean' }).notNull(),
  reverbAmount: integer('reverb_amount').notNull(),
  lowpassHz: integer('lowpass_hz').notNull(),
  builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type Preset = typeof presets.$inferSelect

/** The one settings row; Akapela is one singer's app, so there is nothing to key them by. */
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
