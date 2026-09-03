import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const JOB_TYPES = ['noop'] as const
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
