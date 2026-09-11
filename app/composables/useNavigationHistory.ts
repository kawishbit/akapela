import {
  canGoBack as computeCanGoBack,
  canGoForward as computeCanGoForward,
  currentPath,
  goBack as advanceBack,
  goForward as advanceForward,
  initialNavigationHistory,
  type NavigationHistoryState,
  pushNavigationEntry,
} from '~/utils/navigation-history'

// One `router.afterEach` for the app's lifetime, the same singleton-on-first-use
// shape `useTheme`'s `matchMedia` listener follows: `TitleBar.vue` is the only
// caller today, but a second one must not register the hook twice.
let historyHookRegistered = false

/** Back/Forward for the title bar's own buttons; see `app/utils/navigation-history.ts`. */
export function useNavigationHistory() {
  const route = useRoute()
  const router = useRouter()
  const state = useState<NavigationHistoryState>('navigation-history', () => initialNavigationHistory(route.fullPath))

  // True for the one `afterEach` firing that either button itself caused, so
  // that push is recorded as moving the pointer rather than as a new forward
  // navigation truncating everything ahead of it.
  let navigatingViaButton = false

  if (import.meta.client && !historyHookRegistered) {
    historyHookRegistered = true
    router.afterEach((to) => {
      if (navigatingViaButton) {
        navigatingViaButton = false
        return
      }
      state.value = pushNavigationEntry(state.value, to.fullPath)
    })
  }

  function back(): void {
    if (!computeCanGoBack(state.value)) return
    state.value = advanceBack(state.value)
    navigatingViaButton = true
    void router.push(currentPath(state.value))
  }

  function forward(): void {
    if (!computeCanGoForward(state.value)) return
    state.value = advanceForward(state.value)
    navigatingViaButton = true
    void router.push(currentPath(state.value))
  }

  return {
    canGoBack: computed(() => computeCanGoBack(state.value)),
    canGoForward: computed(() => computeCanGoForward(state.value)),
    back,
    forward,
  }
}
