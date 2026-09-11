/**
 * The stack behind the title bar's own Back/Forward buttons (`TitleBar.vue`,
 * `useNavigationHistory.ts`).
 *
 * Akapela's own, rather than the browser's: Electron's window has no
 * back/forward affordance of its own to wrap, so this is a small stack the
 * app keeps itself, truncated exactly the way a browser's history is
 * whenever a link is followed instead of one of these two buttons.
 */

export interface NavigationHistoryState {
  stack: string[]
  index: number
}

export function initialNavigationHistory(path: string): NavigationHistoryState {
  return { stack: [path], index: 0 }
}

export function currentPath(state: NavigationHistoryState): string {
  return state.stack[state.index]!
}

export function canGoBack(state: NavigationHistoryState): boolean {
  return state.index > 0
}

export function canGoForward(state: NavigationHistoryState): boolean {
  return state.index < state.stack.length - 1
}

/**
 * A forward navigation to a new path — a link followed or a redirect, not
 * either button. Drops any entries ahead of here, the way a browser does
 * when you follow a link after going back.
 */
export function pushNavigationEntry(state: NavigationHistoryState, path: string): NavigationHistoryState {
  if (currentPath(state) === path) return state
  const stack = [...state.stack.slice(0, state.index + 1), path]
  return { stack, index: stack.length - 1 }
}

export function goBack(state: NavigationHistoryState): NavigationHistoryState {
  return canGoBack(state) ? { ...state, index: state.index - 1 } : state
}

export function goForward(state: NavigationHistoryState): NavigationHistoryState {
  return canGoForward(state) ? { ...state, index: state.index + 1 } : state
}
