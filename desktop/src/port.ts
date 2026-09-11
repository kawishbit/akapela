import { createServer } from 'node:net'

/**
 * The loopback port the server listens on, and why it is remembered rather
 * than allocated fresh each launch.
 *
 * `localStorage` is keyed by origin, and `http://127.0.0.1:54321` and
 * `http://127.0.0.1:61234` are different origins. Four per-device settings
 * live there — the output volume (`app/audio/volume.ts`), the theme
 * (`useTheme.ts`), the latency nudge (`useTakeReview.ts`), and the chosen
 * microphone (`useTakeRecorder.ts`) — so a new port every launch would
 * silently reset all four every time. One port is picked on first run and
 * kept; a launch that finds it taken picks another and accepts that this one
 * launch resets those four values.
 *
 * No Electron import here, so this is covered by the root vitest suite.
 */

/**
 * The IANA dynamic/private range. Nothing registered lives here, and it is
 * where an operating system's own ephemeral allocations come from, so a
 * collision means something else is genuinely running rather than that we
 * chose badly.
 */
export const PORT_RANGE_MIN = 49_152
export const PORT_RANGE_MAX = 65_535

/** Enough attempts that exhausting them means something is very wrong, not unlucky. */
const MAX_ATTEMPTS = 50

export class NoFreePortError extends Error {}

/** Whether a port can be bound on loopback right now. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '127.0.0.1')
  })
}

export interface ChoosePortOptions {
  /** Injected in tests; defaults to actually binding the port. */
  free?: (port: number) => Promise<boolean>
  /** Injected in tests; defaults to `Math.random`. */
  random?: () => number
}

/**
 * The remembered port if it is still free, and a fresh one from the dynamic
 * range otherwise.
 */
export async function choosePort(
  remembered: number | undefined,
  { free = isPortFree, random = Math.random }: ChoosePortOptions = {},
): Promise<number> {
  if (remembered !== undefined && isUsablePort(remembered) && await free(remembered)) return remembered

  const tried = new Set<number>()
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = PORT_RANGE_MIN + Math.floor(random() * (PORT_RANGE_MAX - PORT_RANGE_MIN + 1))
    if (tried.has(candidate)) continue
    tried.add(candidate)
    if (await free(candidate)) return candidate
  }
  throw new NoFreePortError(
    `could not find a free loopback port after ${MAX_ATTEMPTS} attempts between ${PORT_RANGE_MIN} and ${PORT_RANGE_MAX}`,
  )
}

/** A port number that could have come from a config file someone edited by hand. */
export function isUsablePort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65_536
}
