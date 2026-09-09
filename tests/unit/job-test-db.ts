import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAkapela, type Akapela } from '../../server/lib/akapela'

/**
 * A real Akapela database (the app's own schema, migrated) in a temp data
 * directory, for tests that exercise the Jobs table directly rather than
 * through the API — `JobsRunner` and the handlers it runs.
 */
export function createJobTestDb() {
  const dataDir = mkdtempSync(join(tmpdir(), 'akapela-jobs-test-'))
  const akapela = createAkapela({
    dataDir,
    migrationsDir: join(process.cwd(), 'server/db/migrations'),
  })

  return {
    akapela,
    dataDir,
    /** Inserts a Job the way the app does: queued, no progress, no timestamps. */
    enqueue(
      type: string,
      options: { id: string, createdAt: number, targetId?: string | null, traceParent?: string | null },
    ): void {
      akapela.sqlite
        .prepare(
          `INSERT INTO jobs (id, type, target_id, state, progress, error, created_at, trace_parent)
           VALUES (?, ?, ?, 'queued', 0, NULL, ?, ?)`,
        )
        .run(options.id, type, options.targetId ?? null, options.createdAt, options.traceParent ?? null)
    },
    getJob(id: string) {
      const row = akapela.sqlite.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined
      if (!row) throw new Error(`job ${id} missing`)
      return row
    },
    close(): void {
      akapela.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export type JobTestDb = ReturnType<typeof createJobTestDb>
export type { Akapela }
