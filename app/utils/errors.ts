import { isErrorCode, type CodedFailure, type ErrorCode } from '~~/shared/error-codes'
import type { Translate } from './i18n'

/**
 * A failure as the singer reads it: a sentence in their Language, and, when
 * the server had no code for it, the raw text it did send. `ErrorMessage.vue`
 * shows the second under an expandable Details, so it is never hidden.
 */
export interface ErrorText {
  message: string
  details: string | null
}

/** A failure the browser raised itself, which has nothing more to show. */
export function errorText(message: string): ErrorText {
  return { message, details: null }
}

export interface DescribeOptions {
  /** Keep the raw text as Details even when the code has words of its own. */
  keepDetails?: boolean
  /**
   * What to say in place of "Something went wrong" when there is no code, for
   * a failure whose context says more: "The Take couldn't be uploaded."
   */
  headline?: string
}

/**
 * The words for a coded failure. `unexpected`, and a code this browser has no
 * words for (a newer server's), read as "Something went wrong", with `raw` as
 * the Details. A recognised code keeps `raw` too when `keepDetails` says so.
 */
export function describeFailure(
  failure: CodedFailure | null,
  raw: string | null,
  t: Translate,
  options: DescribeOptions = {},
): ErrorText {
  const details = raw?.trim() || null
  if (failure && failure.code !== 'unexpected' && isErrorCode(failure.code)) {
    const message = t(`errors.${failure.code}`, failure.params as Record<string, unknown>)
    return { message, details: options.keepDetails ? details : null }
  }
  return { message: options.headline ?? t('errors.unexpected'), details }
}

/**
 * A failed Job's reason. A Job from before codes existed has none, and reads
 * as `unexpected`. The raw text always stays under Details, even with a code:
 * a tool's own output is what a bug report needs.
 */
export function describeJobFailure(
  job: { errorCode: string | null, errorParams: Record<string, string | number> | null, error: string | null },
  t: Translate,
): ErrorText {
  const failure = isErrorCode(job.errorCode)
    ? { code: job.errorCode, params: job.errorParams ?? {} } as CodedFailure
    : null
  return describeFailure(failure, job.error, t, { keepDetails: true })
}

interface ErrorBody {
  statusMessage?: string
  message?: string
  data?: { code?: unknown, params?: unknown }
}

/**
 * The words for a failed request, or anything else a `catch` caught. An API
 * route's error carries `data: { code, params }` beside its English
 * `statusMessage` (ADR 0014); `$fetch` puts that body on `error.data`, while a
 * `NuxtError` carries the `data` itself.
 */
export function describeError(error: unknown, t: Translate, options: Pick<DescribeOptions, 'headline'> = {}): ErrorText {
  const outer = (error && typeof error === 'object' ? error : {}) as ErrorBody & { data?: ErrorBody }
  const response = outer.data && typeof outer.data === 'object'
    && ('statusMessage' in outer.data || 'message' in outer.data || 'data' in outer.data)
  const body: ErrorBody = response ? outer.data! : outer
  const coded = body.data
  const raw = body.statusMessage || body.message || (error instanceof Error ? error.message : String(error))
  if (coded && isErrorCode(coded.code)) {
    const params = (coded.params && typeof coded.params === 'object' ? coded.params : {}) as CodedFailure['params']
    // `invalidRequest` means a bug or a hand-made request, and `invalidBackup`
    // a file that isn't one; either way the English says what was wrong.
    const keepDetails = coded.code === 'invalidRequest' || coded.code === 'invalidBackup'
    return describeFailure({ code: coded.code as ErrorCode, params } as CodedFailure, raw, t, { ...options, keepDetails })
  }
  return describeFailure(null, raw, t, options)
}
