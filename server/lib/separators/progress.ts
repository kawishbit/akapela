/**
 * How `separate-cli.ts` tells the separate Job how far it has got: one
 * `progress <done>/<total>` line on stdout per chunk of the song the model
 * has finished. stdout because it is the simplest channel there is, it
 * behaves the same under `ELECTRON_RUN_AS_NODE=1`, and stderr stays free for
 * the error message the Job already collects on a failure.
 *
 * Both ends live here so the format is written down once. Reading is
 * forgiving: a line that is not a progress line is ignored, so a subprocess
 * that never reports still finishes on its milestones alone.
 */

const PROGRESS_LINE = /^progress (\d+)\/(\d+)$/

export function formatChunkProgress(done: number, total: number): string {
  return `progress ${done}/${total}\n`
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

/** Feeds raw stdout through, calling `onFraction` for each whole progress line, however the reads split them. */
export function chunkProgressReader(onFraction: (fraction: number) => void): (data: Buffer | string) => void {
  let buffered = ''
  return (data) => {
    buffered += data.toString()
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      const fraction = parseChunkProgress(line)
      if (fraction !== null) onFraction(fraction)
    }
  }
}
