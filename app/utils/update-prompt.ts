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
