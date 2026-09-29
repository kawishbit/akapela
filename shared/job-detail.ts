/**
 * What a Job's `detail` column holds: a token the browser puts into words,
 * since the row is read in whatever Language the singer has chosen. Anything
 * a token needs to say comes from the row itself — the Separation Model being
 * downloaded is the Job's own `separationModel`.
 *
 * Rows written before the tokens hold an English line instead, which the
 * browser shows as it is.
 */
export const JOB_DETAILS = [
  /** A Separation is fetching its model before it can start. */
  'downloadingModel',
  /** A Separation the GPU started and the CPU finished. */
  'finishedOnCpu',
] as const

export type JobDetail = (typeof JOB_DETAILS)[number]

export function isJobDetail(value: unknown): value is JobDetail {
  return typeof value === 'string' && (JOB_DETAILS as readonly string[]).includes(value)
}
