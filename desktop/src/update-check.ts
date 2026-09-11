/**
 * The whole of v1's updating story: a look at the latest GitHub release and a
 * link if it is newer than what is running.
 *
 * No downloading, no installing, no electron-updater — that is real machinery
 * with real failure modes for a first release nobody has installed yet. A
 * notice with a link is honest and costs nothing to get wrong.
 *
 * No Electron import, so the comparison is covered by the root vitest suite.
 */
import type { DesktopUpdate } from './bridge.cjs'

export const RELEASES_URL = 'https://github.com/kawishbit/akapela/releases/latest'
const LATEST_RELEASE_API = 'https://api.github.com/repos/kawishbit/akapela/releases/latest'
const CHECK_TIMEOUT_MS = 8_000

/** `v0.2.0` and `0.2.0` are the same release; tags carry the `v`, `package.json` does not. */
function parts(version: string): number[] {
  return version.replace(/^v/, '').split(/[.-]/).map(part => Number.parseInt(part, 10) || 0)
}

/** Whether `candidate` is a later release than `current`, comparing numerically part by part. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parts(candidate)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left > right
  }
  return false
}

/**
 * The newer release, or null — including whenever the check itself fails.
 * Nobody is blocked on this answer, so a machine with no network gets silence
 * rather than an error.
 */
export async function checkForUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DesktopUpdate | null> {
  try {
    const response = await fetchImpl(LATEST_RELEASE_API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'Akapela' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const release = await response.json() as { tag_name?: string, html_url?: string, draft?: boolean, prerelease?: boolean }
    if (release.draft || release.prerelease || !release.tag_name) return null
    if (!isNewerVersion(release.tag_name, currentVersion)) return null
    return { version: release.tag_name.replace(/^v/, ''), url: release.html_url ?? RELEASES_URL }
  }
  catch {
    return null
  }
}
