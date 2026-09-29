import { createError } from 'h3'
import type { CodedFailure } from '../../shared/error-codes'

/**
 * An API route's refusal. `statusMessage` stays the English it always was, for
 * logs, traces, and anyone calling the API by hand; `data` carries the code
 * the browser turns into the singer's Language (ADR 0014).
 */
export function apiError(statusCode: number, coded: CodedFailure, statusMessage: string) {
  return createError({ statusCode, statusMessage, data: coded })
}
