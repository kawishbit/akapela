import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { JOB_TYPES, jobs, type Job, type JobType } from '../db/schema'
import { currentTraceParent } from './request-trace'
import type { SeparationModelName } from './separators/models'
import type { Akapela } from './akapela'

/**
 * One of the three lines Jobs wait in, side by side (ADR 0012 and its
 * amendment): `heavy` runs Separations, `playlist` runs the imports a
 * Playlist Import started, and `light` runs everything else. Derived from the
 * Job and never stored, so a type added later lands in the light Lane without
 * anyone deciding it should.
 */
export type Lane = 'heavy' | 'playlist' | 'light'

export const LANES: readonly Lane[] = ['heavy', 'playlist', 'light']

export const HEAVY_JOB_TYPE: JobType = 'separate'

/** What decides a Job's Lane: its type, and whether a Playlist Import started it. */
export type LaneDeciding = Pick<Job, 'type' | 'playlistImportId'>

/**
 * A Separation is heavy whatever started it. An import a Playlist Import
 * started waits behind that playlist's other imports, never in front of a Mix
 * or an import started by hand.
 */
export function laneOf(job: LaneDeciding): Lane {
  if (job.type === HEAVY_JOB_TYPE) return 'heavy'
  if (job.type === 'import' && job.playlistImportId) return 'playlist'
  return 'light'
}

/**
 * `laneOf` as an SQL condition over a `jobs` row, which is how a runner
 * claims only its own Lane's Jobs. Kept beside `laneOf` so the two cannot
 * drift apart.
 */
export function laneCondition(lane: Lane): string {
  const playlist = `(type = 'import' AND playlist_import_id IS NOT NULL)`
  switch (lane) {
    case 'heavy': return `type = '${HEAVY_JOB_TYPE}'`
    case 'playlist': return playlist
    case 'light': return `(type != '${HEAVY_JOB_TYPE}' AND NOT ${playlist})`
  }
}

export function isJobType(value: unknown): value is JobType {
  return typeof value === 'string' && (JOB_TYPES as readonly string[]).includes(value)
}

/** The Playlist Import a Job is part of: its id, and the playlist's name to show beside it. */
export interface PlaylistImportLabel {
  id: string
  name: string
}

export function enqueueJob(
  akapela: Akapela,
  input: {
    type: JobType
    targetId?: string | null
    separationModel?: SeparationModelName | null
    playlistImport?: PlaylistImportLabel | null
  },
): Job {
  const job: Job = {
    id: randomUUID(),
    type: input.type,
    targetId: input.targetId ?? null,
    state: 'queued',
    progress: 0,
    error: null,
    errorCode: null,
    errorParams: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    // Taken from the request rather than passed in, so every caller — and
    // every future one — correlates without knowing that it does. Null
    // whenever nothing is tracing, which is every run outside the AppHost.
    traceParent: currentTraceParent(),
    separationModel: input.separationModel ?? null,
    detail: null,
    playlistImportId: input.playlistImport?.id ?? null,
    playlistImportName: input.playlistImport?.name ?? null,
  }
  akapela.db.insert(jobs).values(job).run()
  return job
}

/**
 * Whether any Job is queued or running.
 *
 * `inArray` rather than two queries so the answer is one moment in time: a
 * Job moving from `queued` to `running` between them would otherwise read as
 * nothing happening at all.
 */
export function jobsBusy(akapela: Akapela): boolean {
  const active = akapela.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(inArray(jobs.state, ['queued', 'running']))
    .limit(1)
    .get()
  return active !== undefined
}

export function getJob(akapela: Akapela, id: string): Job | undefined {
  return akapela.db.select().from(jobs).where(eq(jobs.id, id)).get()
}

/** A Job's Playlist Import label, or null when it has none. */
export function playlistImportOf(job: Pick<Job, 'playlistImportId' | 'playlistImportName'>): PlaylistImportLabel | null {
  return job.playlistImportId ? { id: job.playlistImportId, name: job.playlistImportName ?? '' } : null
}
