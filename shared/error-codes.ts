/**
 * Every failure the server can hand a singer, as a stable code the browser
 * turns into words (ADR 0014). The server still writes its English for logs,
 * traces, and a Job's `error` column; the code is what the UI reads.
 *
 * Each code lists the names of its parameters, and `en.json` has an
 * `errors.<code>` entry that uses exactly those; the suite checks both. Codes
 * are coarse on purpose: two failures share one when telling them apart
 * wouldn't change what the singer does next.
 */
export const ERROR_CODES = {
  /** Anything without a code of its own. Shown as "Something went wrong", with the raw text as Details. */
  unexpected: [],

  // Jobs: what an import, a Separation, or a Mix can run into.
  /** The server's disk is full. */
  diskFull: [],
  /** A program the server runs (ffmpeg, yt-dlp) isn't installed or isn't on its PATH. */
  toolMissing: ['tool'],
  /** yt-dlp needs a JavaScript runtime for YouTube, and the server has none. */
  jsRuntimeMissing: [],
  /** The server has a JavaScript runtime, and it would not run what YouTube sent. */
  jsRuntimeFailed: [],
  /** YouTube won't hand this video over: private, removed, age-restricted, or blocked where the server is. */
  videoUnavailable: [],
  /** yt-dlp found nothing to import at the link. */
  sourceNotFound: [],
  /** The link is a playlist rather than one video. */
  sourceIsPlaylist: [],
  /** yt-dlp failed some other way, which is usually YouTube having changed under it. */
  ytDlpFailed: [],
  /** Akapela could not fetch its own copy of yt-dlp. */
  ytDlpDownloadFailed: [],
  /** A Separation Model could not be downloaded. */
  modelDownloadFailed: ['model'],
  /** A file could not be read as audio. */
  audioUndecodable: [],

  // API routes: what a request can be refused for.
  /** An upload whose type Akapela doesn't import. */
  unsupportedUpload: [],
  /** Text that isn't a link to one YouTube video. */
  invalidYoutubeUrl: [],

  // Lyrics.
  /** A Lyrics Provider answered badly or not at all. */
  lyricsProviderUnreachable: ['provider'],
  /** A Lyrics Provider this Akapela has no token for. */
  lyricsProviderUnavailable: ['provider'],
} as const satisfies Record<string, readonly string[]>

export type ErrorCode = keyof typeof ERROR_CODES

/** A code's parameters by name. Given several codes, one of theirs. */
export type ErrorParams<C extends ErrorCode = ErrorCode> = C extends ErrorCode
  ? { [K in (typeof ERROR_CODES)[C][number]]: string | number }
  : never

/**
 * What a coded failure carries across the wire: in an API error's `data`, or a
 * Job's two columns. Given several codes, one of them with its own parameters.
 */
export type CodedFailure<C extends ErrorCode = ErrorCode> = C extends ErrorCode
  ? { code: C, params: ErrorParams<C> }
  : never

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CODES, value)
}

/** A coded failure, built without spelling out `params` for a code that has none. */
export function failure<C extends ErrorCode>(code: C, ...params: ErrorParams<C> extends Record<string, never> ? [] : [ErrorParams<C>]): CodedFailure<C> {
  return { code, params: params[0] ?? {} } as CodedFailure<C>
}

/**
 * A failure with a code. Thrown on the server wherever the singer could act on
 * the cause; `message` is the English that logs and traces keep.
 */
export class CodedError<C extends ErrorCode = ErrorCode> extends Error {
  readonly failure: CodedFailure<C>

  constructor(coded: CodedFailure<C>, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
    this.failure = coded
  }

  get code(): C {
    return this.failure.code as C
  }
}

/** A full disk says so the same way whichever write hit it. */
const DISK_FULL = /ENOSPC|No space left on device/

/**
 * The code and parameters of any thrown value: its own when it has one, then
 * a full disk wherever it surfaced, and `unexpected` for everything else.
 */
export function toCodedFailure(error: unknown): CodedFailure {
  if (error instanceof CodedError && error.code !== 'unexpected') return error.failure
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'ENOSPC' || DISK_FULL.test(message)) return failure('diskFull')
  return failure('unexpected')
}
