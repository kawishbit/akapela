/**
 * How `separate-cli.ts` tells the separate Job what is happening: one
 * `progress <done>/<total>` line on stdout per chunk of the song the model has
 * finished, and a `notice <text>` line for anything worth logging that is not
 * a failure — the priority it could not lower, say. stdout because it is the
 * simplest channel there is, it behaves the same under `ELECTRON_RUN_AS_NODE=1`,
 * and stderr stays free for the error message the Job already collects on a
 * failure.
 *
 * Both ends live here so the format is written down once. Reading is
 * forgiving: a line that is neither is ignored, so a subprocess that never
 * reports still finishes on its milestones alone.
 */

const PROGRESS_LINE = /^progress (\d+)\/(\d+)$/
const NOTICE_PREFIX = 'notice '
const FALLBACK_PREFIX = 'fallback '
const ACCELERATOR_PREFIX = 'accelerator '

export function formatChunkProgress(done: number, total: number): string {
  return `progress ${done}/${total}\n`
}

/** One line, whatever `text` contained, so a message with a newline in it cannot break the stream apart. */
export function formatNotice(text: string): string {
  return `${NOTICE_PREFIX}${text.replace(/\s*\n\s*/g, ' ').trim()}\n`
}

/**
 * The GPU failed and the rest of the Separation runs on the CPU, with why. At
 * most once per Separation; the Job says so on its row when it finishes.
 */
export function formatFallback(reason: string): string {
  return `${FALLBACK_PREFIX}${reason.replace(/\s*\n\s*/g, ' ').trim()}\n`
}

/** What `--detect` answers: the backend it proved, as `dml:1`, or `none`. */
export function formatDetected(accelerator: string | null): string {
  return `${ACCELERATOR_PREFIX}${accelerator ?? 'none'}\n`
}

/** The accelerator a `--detect` run printed, `null` for `none`, or undefined when it printed no answer at all. */
export function parseDetected(output: string): string | null | undefined {
  const line = output.split('\n').map(l => l.trim()).find(l => l.startsWith(ACCELERATOR_PREFIX))
  if (line === undefined) return undefined
  const value = line.slice(ACCELERATOR_PREFIX.length)
  return value === 'none' ? null : value
}

/** The fraction a progress line reports, or null for any other line. */
export function parseChunkProgress(line: string): number | null {
  const match = PROGRESS_LINE.exec(line.trim())
  if (!match) return null
  const done = Number(match[1])
  const total = Number(match[2])
  if (total === 0 || done > total) return null
  return done / total
}

/** The text a notice line carries, or null for any other line. */
export function parseNotice(line: string): string | null {
  const trimmed = line.trim()
  return trimmed.startsWith(NOTICE_PREFIX) ? trimmed.slice(NOTICE_PREFIX.length) : null
}

export interface CliOutputHandlers {
  onFraction?: (fraction: number) => void
  onNotice?: (text: string) => void
  onFallback?: (reason: string) => void
}

/** Feeds raw stdout through, calling a handler for each whole line it recognises, however the reads split them. */
export function cliOutputReader({ onFraction, onNotice, onFallback }: CliOutputHandlers): (data: Buffer | string) => void {
  let buffered = ''
  return (data) => {
    buffered += data.toString()
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      const fraction = parseChunkProgress(line)
      if (fraction !== null) {
        onFraction?.(fraction)
        continue
      }
      const notice = parseNotice(line)
      if (notice !== null) {
        onNotice?.(notice)
        continue
      }
      const trimmed = line.trim()
      if (trimmed.startsWith(FALLBACK_PREFIX)) onFallback?.(trimmed.slice(FALLBACK_PREFIX.length))
    }
  }
}

/** Only the progress lines — what a caller that has nothing to log wants. */
export function chunkProgressReader(onFraction: (fraction: number) => void): (data: Buffer | string) => void {
  return cliOutputReader({ onFraction })
}
