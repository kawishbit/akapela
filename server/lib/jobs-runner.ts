import type Database from 'better-sqlite3'
import type { Job, JobType } from '../db/schema'
import { importHandler } from './jobs/import-track'
import { runRender } from './jobs/render'
import { MdxNetSeparator, separateHandler } from './jobs/separate'
import { YtDlpFetcher } from './sources'
import type { Telemetry } from './telemetry'
import { HEAVY_JOB_TYPE, type Lane } from './jobs'
import { RunningJobs } from './running-jobs'

export type { Lane }

/**
 * Claims queued Jobs one at a time and runs them to a terminal state, in
 * process — the Nuxt server's own replacement for the Python worker's polling
 * loop (`worker/akapela_worker/runner.py`, ADR 0002). Talks to the `jobs`
 * table directly with prepared statements rather than through drizzle, the
 * same way the Python runner talks to it with raw SQL: this is the one place
 * that owns every state transition after `queued`, and a hand-written INSERT
 * elsewhere doing the wrong thing should not be possible to typo past.
 */

/** What a handler gets: the Job, where files live, the database, and a progress hook. */
export interface JobContext {
  readonly job: Job
  readonly dataDir: string
  readonly sqlite: Database.Database
  /** Puts `percent` (clamped 0-100) on the Job row. */
  progress(percent: number): void
  /** Puts one line on the Job row about what it is doing that progress cannot say, or clears it with null. */
  detail(text: string | null): void
  /**
   * Aborts when the singer cancels this Job. A handler kills whatever it
   * spawned, removes its partial output, and returns or throws; the row is
   * already `cancelled`, and the cleanup that puts its target back runs once
   * the handler has let go. Never aborted by shutdown.
   */
  readonly signal: AbortSignal
}

/**
 * One Job type's work. Async so a handler can `await` a spawned subprocess —
 * ffmpeg, yt-dlp, or (for `separate`) `separate-cli.ts` running the ONNX
 * inference in its own `node` process — without blocking the HTTP server.
 */
export type Handler = (ctx: JobContext) => Promise<void>

/**
 * Every Job type the app enqueues now runs in process, claimed and tracked
 * here; genuinely CPU-heavy work (the separate Job's ONNX inference) still
 * runs in its own subprocess rather than on this thread — see
 * `jobs/separate.ts`.
 */
export const DEFAULT_HANDLERS: Partial<Record<JobType, Handler>> = {
  noop: async ctx => ctx.progress(50),
  import: importHandler(new YtDlpFetcher()),
  render: runRender,
  separate: separateHandler(new MdxNetSeparator()),
}

interface JobRow {
  id: string
  type: string
  target_id: string | null
  state: string
  progress: number
  error: string | null
  created_at: number
  started_at: number | null
  finished_at: number | null
  trace_parent: string | null
  separation_model: string | null
  detail: string | null
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type as JobType,
    targetId: row.target_id,
    state: row.state as Job['state'],
    progress: row.progress,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    traceParent: row.trace_parent,
    separationModel: row.separation_model as Job['separationModel'],
    detail: row.detail,
  }
}

/** Answers every call and does nothing — what a Runner built without telemetry uses, which is every test but a handful, and every run outside the AppHost. */
const NO_TELEMETRY: Telemetry = {
  enabled: false,
  beginRequest: () => null,
  beginJob: () => null,
  recordBrowserLogs: () => {},
  flush: async () => {},
  shutdown: async () => {},
}

/** The `claimNext` filter for one Lane, or for both when a runner is given none. */
function laneFilter(lane: Lane | undefined): string {
  if (lane === 'heavy') return `AND type = '${HEAVY_JOB_TYPE}'`
  if (lane === 'light') return `AND type != '${HEAVY_JOB_TYPE}'`
  return ''
}

export class JobsRunner {
  private readonly sqlite: Database.Database
  private readonly dataDir: string
  private readonly handlers: Partial<Record<JobType, Handler>>
  private readonly telemetry: Telemetry
  private readonly lane: Lane | undefined
  private readonly running: RunningJobs

  constructor(
    sqlite: Database.Database,
    dataDir: string,
    options: {
      handlers?: Partial<Record<JobType, Handler>>
      telemetry?: Telemetry
      /** Which Lane this runner claims from. Left out, it claims from both — what a test running one Job wants. */
      lane?: Lane
      /** Where a running Job registers, so a cancel can reach it. Shared with the API through `Akapela`. */
      running?: RunningJobs
    } = {},
  ) {
    this.sqlite = sqlite
    this.dataDir = dataDir
    this.handlers = options.handlers ?? DEFAULT_HANDLERS
    this.telemetry = options.telemetry ?? NO_TELEMETRY
    this.lane = options.lane
    this.running = options.running ?? new RunningJobs()
  }

  /**
   * Requeues any Job left `running` by a previous process that died. Returns
   * how many. Across both Lanes, so it is called once at startup before
   * either loop starts, never per Lane.
   */
  recoverStaleJobs(): number {
    const result = this.sqlite
      .prepare(`UPDATE jobs SET state = 'queued', started_at = NULL, progress = 0, detail = NULL WHERE state = 'running'`)
      .run()
    return result.changes
  }

  /** Atomically moves this Lane's oldest queued Job to running and returns it, or null when there is none. */
  private claimNext(): Job | null {
    const row = this.sqlite
      .prepare(
        `UPDATE jobs SET state = 'running', started_at = ?
         WHERE id = (
           SELECT id FROM jobs WHERE state = 'queued' ${laneFilter(this.lane)}
           ORDER BY created_at, rowid LIMIT 1
         )
         RETURNING id, type, target_id, state, progress, error, created_at, started_at, finished_at, trace_parent,
           separation_model, detail`,
      )
      .get(Date.now()) as JobRow | undefined
    return row ? toJob(row) : null
  }

  private setProgress(jobId: string, percent: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)))
    this.sqlite.prepare(`UPDATE jobs SET progress = ? WHERE id = ?`).run(clamped, jobId)
  }

  /** Runs at most one Job. Returns false when the queue was empty. */
  async runOnce(): Promise<boolean> {
    const job = this.claimNext()
    if (!job) return false

    const run = this.running.start(job.id)
    const ctx: JobContext = {
      job,
      dataDir: this.dataDir,
      sqlite: this.sqlite,
      progress: percent => this.setProgress(job.id, percent),
      detail: text => this.sqlite.prepare(`UPDATE jobs SET detail = ? WHERE id = ?`).run(text, job.id),
      signal: run.signal,
    }

    // The span wraps the terminal UPDATE as well as the handler, so what the
    // Dashboard shows is the Job's lifetime rather than the handler's alone —
    // finished only once the row actually says so.
    const span = this.telemetry.beginJob(job, job.traceParent)
    try {
      const handler = this.handlers[job.type]
      if (!handler) throw new Error(`no handler for job type '${job.type}'`)
      await handler(ctx)
      // `AND state = 'running'` throughout: a cancelled Job's row already says
      // so, and whatever the handler did after its signal aborted must not
      // turn that into a success or a failure.
      this.sqlite
        .prepare(`UPDATE jobs SET state = 'succeeded', progress = 100, finished_at = ? WHERE id = ? AND state = 'running'`)
        .run(Date.now(), job.id)
    }
    catch (error) {
      if (!run.signal.aborted) {
        span?.failed(error)
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        this.sqlite
          .prepare(`UPDATE jobs SET state = 'failed', error = ?, finished_at = ? WHERE id = ? AND state = 'running'`)
          .run(message, Date.now(), job.id)
      }
    }
    finally {
      run.finished()
      span?.finish()
    }
    return true
  }

  /**
   * Polls forever, `pollIntervalMs` apart whenever the queue is empty. Stops
   * as soon as `signal` aborts — checked between Jobs, never mid-Job, so a
   * shutdown lets whatever is running finish rather than tearing it down.
   * Stale Jobs are not recovered here: that is `recoverStaleJobs`, called
   * once for both Lanes before either loop starts.
   */
  async runForever(pollIntervalMs: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const ran = await this.runOnce()
      if (!ran && !signal.aborted) await sleep(pollIntervalMs, signal)
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}
