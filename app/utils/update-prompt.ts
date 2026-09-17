/**
 * When the Desktop App may ask the singer about an Update.
 *
 * The prompt belongs to the app rather than a native dialog (ADR 0009's
 * amendment on Updates), and that is the whole reason this rule exists: a
 * native dialog appears whenever the launch check happens to finish, which
 * could be halfway through a Take. This one waits instead, and the offer keeps
 * until the singer is somewhere it would not interrupt.
 *
 * Which pages those are is `updatePrompt: false` in a page's `definePageMeta`,
 * the same way the player bar keeps off the Sing screen.
 */

/** A Release newer than the one running, as the shell reports it. */
export interface UpdateOffer {
  version: string
  url: string
}

export interface UpdatePromptState {
  /** The waiting Update, or null when there is none — including in a browser. */
  offer: UpdateOffer | null
  /** Whether the singer has already dealt with this offer, however they answered. */
  answered: boolean
}

export function promptShows(state: UpdatePromptState, page: { pageAllowsPrompt: boolean }): boolean {
  if (!state.offer || state.answered) return false
  return page.pageAllowsPrompt
}

/** How this build can take an Update, as the shell reports it. */
export type UpdateInstallMode = 'in-place' | 'link'

/** Where an in-place install has got to. Always `idle` where the mode is `link`. */
export type UpdateInstallState =
  | { state: 'idle' }
  | { state: 'downloading', percent: number }
  | { state: 'ready', version: string }
  | { state: 'failed', message: string }

export interface PromptOffer {
  /** The one thing the main button does now. */
  act: 'download-page' | 'install' | 'downloading' | 'restart'
  /** Whether Later and Skip belong here: a download in flight has nothing to defer to. */
  dismissable: boolean
  /** Download progress to draw, or null when there is nothing being downloaded. */
  progress: number | null
  /**
   * Whether restarting has to wait. True only with an Update ready and a Job
   * still running: the restart would requeue it and start it from nothing, so
   * the singer is left with installing on quit instead.
   */
  restartBlocked: boolean
}

/**
 * What the prompt offers, given how this platform updates and how far an
 * install has got.
 *
 * A failed install offers the download page rather than a retry, which is what
 * makes every failure end where macOS always ends (ADR 0009's amendment on
 * Updates): the singer can always get the Release by hand.
 */
export function promptOffers(
  input: { mode: UpdateInstallMode, install: UpdateInstallState, jobsBusy: boolean },
): PromptOffer {
  const { mode, install, jobsBusy } = input
  if (install.state === 'downloading') {
    return { act: 'downloading', dismissable: false, progress: install.percent, restartBlocked: false }
  }
  if (install.state === 'ready') {
    return { act: 'restart', dismissable: true, progress: 100, restartBlocked: jobsBusy }
  }
  if (install.state === 'failed' || mode === 'link') {
    return { act: 'download-page', dismissable: true, progress: null, restartBlocked: false }
  }
  return { act: 'install', dismissable: true, progress: null, restartBlocked: false }
}
