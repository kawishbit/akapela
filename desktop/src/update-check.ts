/**
 * Deciding what there is to update to, and how this build could take it.
 *
 * This file answers the questions with a right answer: is there a newer
 * Release, has the singer skipped it, do they want to be asked at all, and can
 * this platform install for itself. `updater.ts` is the part that actually
 * downloads and installs, and it stays separate because it cannot be tested
 * without a real installer and a real Release.
 *
 * The lookup is still GitHub's own API rather than electron-updater's
 * metadata: it is the one answer macOS can act on too, and it is the same
 * answer on every platform (ADR 0009's amendment on Updates).
 *
 * No Electron import, so all of it is covered by the root vitest suite.
 */
import type { DesktopUpdate } from './bridge.cjs'
import type { DesktopConfig } from './config.js'

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
 * What to actually offer the singer, given what they last chose to skip.
 *
 * A skip covers that Release and anything not newer than it, so skipping is
 * "stop asking" rather than "ask me again next launch" — `Later` is the choice
 * that means the latter. A config value that is not a version at all (edited
 * by hand, written by an older build) reads as nothing skipped, the way the
 * rest of the config treats what it cannot understand.
 */
export function offeredUpdate(found: DesktopUpdate | null, skipped: string | undefined): DesktopUpdate | null {
  if (!found) return null
  if (typeof skipped !== 'string' || !/^v?\d+(\.\d+)*/.test(skipped)) return found
  return isNewerVersion(found.version, skipped) ? found : null
}

/**
 * How this build can take an Update: install it itself, or send the singer to
 * the download page (ADR 0009's amendment on Updates).
 *
 * macOS always links, because Squirrel.Mac refuses to apply an update to an
 * unsigned app and there is no Apple Developer account behind the build. When
 * there is, this returns 'in-place' for darwin too and nothing else changes.
 *
 * Linux only installs in place when it is actually running as an AppImage:
 * electron-updater replaces that one file, and an extracted or unpacked build
 * gives it nothing to replace. A checkout and an attached dev-server window
 * are never updated at all; there is no installer under them.
 */
export type UpdateInstallMode = 'in-place' | 'link'

export function updateInstallMode(
  platform: NodeJS.Platform,
  where: { packaged: boolean, attached: boolean, appImage: string | undefined },
): UpdateInstallMode {
  if (!where.packaged || where.attached) return 'link'
  if (platform === 'win32') return 'in-place'
  if (platform === 'linux') return where.appImage ? 'in-place' : 'link'
  return 'link'
}

/** Whether the shell checks at launch. Anything other than a stored `false` means it does. */
export function automaticChecks(config: DesktopConfig): boolean {
  return config.automaticUpdateChecks !== false
}

/**
 * What the latest Release turned out to be.
 *
 * `current` and `failed` are separate answers because **Check now** has to
 * tell them apart: the singer asked, so "you are on the latest" and "I could
 * not reach GitHub" cannot look the same. The launch check collapses both to
 * silence (see `checkForUpdate`).
 */
export type UpdateCheck =
  | { state: 'available', update: DesktopUpdate }
  | { state: 'current' }
  | { state: 'failed' }

export async function checkLatestRelease(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateCheck> {
  try {
    const response = await fetchImpl(LATEST_RELEASE_API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'Akapela' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    if (!response.ok) return { state: 'failed' }
    const release = await response.json() as { tag_name?: string, html_url?: string, draft?: boolean, prerelease?: boolean }
    // A draft or a prerelease is not something to offer, and not a failure
    // either: there is simply nothing newer that counts.
    if (release.draft || release.prerelease || !release.tag_name) return { state: 'current' }
    if (!isNewerVersion(release.tag_name, currentVersion)) return { state: 'current' }
    return {
      state: 'available',
      update: { version: release.tag_name.replace(/^v/, ''), url: release.html_url ?? RELEASES_URL },
    }
  }
  catch {
    return { state: 'failed' }
  }
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
  const checked = await checkLatestRelease(currentVersion, fetchImpl)
  return checked.state === 'available' ? checked.update : null
}
