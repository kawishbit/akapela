/**
 * Where the window's Akapela comes from, and the decisions around a
 * Connected Desktop App: pointed at an Akapela running elsewhere (a compose
 * install on the household server) instead of the one it would start itself.
 *
 * Plain functions with no Electron import, so the root vitest suite covers
 * what is easy to get wrong — a URL typed three different ways, which origin
 * gets the secure-context grant, and which version mismatch to refuse.
 */
import type { DesktopConfig } from './config.js'

/**
 * - `attached`: `AKAPELA_SERVER_URL` is set — the contributor loop in
 *   `CLAUDE.md`, pointed at `pnpm dev` or `aspire run`. Wins over anything
 *   stored, so none of this changes that loop.
 * - `local`: Use this computer. The shell starts and supervises its own server.
 * - `connected`: a server elsewhere. The shell starts nothing of its own.
 * - `unchosen`: first launch; the shell asks.
 */
export type ServerMode =
  | { kind: 'attached', url: string }
  | { kind: 'local' }
  | { kind: 'connected', url: string }
  | { kind: 'unchosen' }

export type NormalizedUrl = { ok: true, url: string } | { ok: false, error: string }

export const UNPARSEABLE_URL_MESSAGE
  = 'That is not a web address. Type what you would type into a browser, such as 192.168.1.20:3000.'

/**
 * The origin a typed address names: a bare host becomes `http://host`, and
 * anything after the origin — a trailing slash, a page, a query — is dropped,
 * since the window always opens the app at its root. Only http and https.
 * The one place an address becomes a URL, so what is loaded and what is
 * granted secure-context status cannot drift apart.
 */
export function normalizeServerUrl(input: string): NormalizedUrl {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: UNPARSEABLE_URL_MESSAGE }
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  }
  catch {
    return { ok: false, error: UNPARSEABLE_URL_MESSAGE }
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    return { ok: false, error: UNPARSEABLE_URL_MESSAGE }
  }
  return { ok: true, url: parsed.origin }
}

/** Which Akapela this launch opens, from the development override and what the config remembers. */
export function resolveServerMode(attachedUrl: string | undefined, config: DesktopConfig): ServerMode {
  const attached = attachedUrl?.trim()
  if (attached) return { kind: 'attached', url: attached }
  const server = config.server
  if (server?.mode === 'local') return { kind: 'local' }
  if (server?.mode === 'connected' && typeof server.url === 'string') {
    const normalized = normalizeServerUrl(server.url)
    // A stored address that no longer parses (the file was edited by hand) is
    // asked about again, rather than guessed at.
    if (normalized.ok) return { kind: 'connected', url: normalized.url }
  }
  // An install from before the choice existed has been using this computer
  // all along: it remembered a port because its own server ran. Asking it
  // "where is your Akapela?" after an Update would be a question with an
  // obvious answer.
  if (!server && typeof config.port === 'number') return { kind: 'local' }
  return { kind: 'unchosen' }
}

/**
 * The one origin to treat as a secure context, or null for none.
 *
 * Singing needs `getUserMedia` and an AudioWorklet, which Chromium only gives
 * a secure context: `https://`, or loopback. A Connected window on
 * `http://192.168.1.20:3000` is neither, so the shell grants exactly that
 * origin — never a wildcard, never a second host, never https (which needs
 * nothing), and never this computer's own server, which is on loopback
 * already. See ADR 0015, which amends 0009.
 */
export function secureContextGrant(mode: ServerMode): string | null {
  if (mode.kind !== 'connected') return null
  return mode.url.startsWith('http://') ? mode.url : null
}

interface ParsedVersion {
  core: [number, number, number]
  pre: string[] | null
}

function parseVersion(version: string | undefined): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z.-]+))?(?:\+.*)?$/i.exec(version?.trim() ?? '')
  if (!match) return null
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : null,
  }
}

/** Semver precedence: the core numerically, then a pre-release below its Release, then identifier by identifier. */
function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i]! - b.core[i]!
  }
  if (!a.pre || !b.pre) return (a.pre ? -1 : 0) - (b.pre ? -1 : 0)
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const left = a.pre[i]
    const right = b.pre[i]
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue
    const leftIsNumber = /^\d+$/.test(left)
    const rightIsNumber = /^\d+$/.test(right)
    if (leftIsNumber && rightIsNumber) return Number(left) - Number(right)
    if (leftIsNumber) return -1
    if (rightIsNumber) return 1
    return left < right ? -1 : 1
  }
  return 0
}

/**
 * Whether a server's Release is one this shell can load.
 *
 * Connected, the whole UI comes from the server while the title bar, the
 * preload bridge, and the update check stay in the shell — so a server
 * **newer** than the shell may serve an app that expects a bridge method this
 * shell lacks. That is refused. Older is the safe direction, since the served
 * app can only ask for what already existed, and so is a server that reports
 * no version or one that does not parse: only a newer one is dangerous.
 */
export function compareServerVersion(serverVersion: string | undefined, shellVersion: string): 'newer' | 'ok' {
  const server = parseVersion(serverVersion)
  const shell = parseVersion(shellVersion)
  if (!server || !shell) return 'ok'
  return compareVersions(server, shell) > 0 ? 'newer' : 'ok'
}

export type ProbeResult =
  | { state: 'akapela', version: string | undefined }
  | { state: 'not-akapela' }
  | { state: 'unreachable' }

const PROBE_TIMEOUT_MS = 5_000

/**
 * Asks a candidate server whether it is an Akapela, and which Release.
 *
 * `/api/version` answers both. A Release from before that route existed still
 * answers `/api/jobs/busy` with its own shape, so that counts as an Akapela of
 * unknown version — which the version check lets through. Anything else that
 * answers is some other web server; nothing answering at all is its own,
 * different message.
 */
export async function probeServer(url: string, fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  const ask = async (path: string): Promise<unknown> => {
    const response = await fetchImpl(`${url}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!response.ok) return undefined
    try {
      return await response.json()
    }
    catch {
      return null
    }
  }
  try {
    const answer = await ask('/api/version') as { app?: unknown, version?: unknown } | null | undefined
    if (answer?.app === 'akapela') {
      return { state: 'akapela', version: typeof answer.version === 'string' ? answer.version : undefined }
    }
    // Something answered, and it was not an Akapela's answer.
    if (answer !== undefined) return { state: 'not-akapela' }
    const busy = await ask('/api/jobs/busy') as { busy?: unknown } | null | undefined
    return typeof busy?.busy === 'boolean' ? { state: 'akapela', version: undefined } : { state: 'not-akapela' }
  }
  catch {
    return { state: 'unreachable' }
  }
}

/**
 * How long to wait before asking a missing server again: two seconds, then
 * doubling, never more than thirty — prompt enough that a rebooted server
 * brings the window back on its own, gentle enough not to hammer one that is
 * still booting.
 */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt))
}
