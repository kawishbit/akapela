import { promptOffers, promptShows, type UpdateOffer } from '~/utils/update-prompt'

const JOBS_BUSY_POLL_MS = 3_000

/**
 * Module scope, so these are shared by every component that calls the
 * composable rather than one set each. Both the prompt (from `app.vue`) and
 * the Settings page ask for it, and two subscriptions writing one piece of
 * shared state — and two intervals polling one route — is work for nothing.
 */
let subscribers = 0
let unsubscribeInstall: (() => void) | undefined
let busyPoll: ReturnType<typeof setInterval> | undefined

/**
 * The Update the Desktop App is offering, shared by the prompt and Settings.
 *
 * Shared through `useState` rather than kept per component, because the two
 * screens are two views of one thing: **Check now** in Settings has to be able
 * to open the very prompt the launch check would have opened, and answering
 * the prompt has to settle the notice in Settings too.
 *
 * Inert in a browser, like everything else behind `useDesktop()`.
 */
export function useUpdates() {
  const desktop = useDesktop()
  const route = useRoute()

  const offer = useState<UpdateOffer | null>('akapela-update-offer', () => null)
  const answered = useState<boolean>('akapela-update-answered', () => false)
  const checking = useState<boolean>('akapela-update-checking', () => false)
  /** What the last check the singer asked for came back with; null until they ask. */
  const lastCheck = useState<DesktopUpdateCheck | null>('akapela-update-last-check', () => null)
  const automatic = useState<boolean>('akapela-update-automatic', () => true)
  const mode = useState<DesktopUpdateInstallMode>('akapela-update-mode', () => 'link')
  const install = useState<DesktopUpdateInstallState>('akapela-update-install', () => ({ state: 'idle' }))
  /** Whether a Job is queued or running, which is what holds a restart back. */
  const jobsBusy = useState<boolean>('akapela-update-jobs-busy', () => false)

  // What the launch check found, once the bridge has answered.
  watch(desktop.update, (found) => { if (found) offer.value = found }, { immediate: true })

  onMounted(async () => {
    if (!desktop.isDesktop.value) return
    automatic.value = await desktop.automaticUpdateChecks()
    mode.value = await desktop.updateInstallMode()
    install.value = await desktop.updateInstallState()
    // The download outlives any one component: the shell reports where it got
    // to, and the prompt follows it. Subscribed once however many components
    // are asking.
    subscribers += 1
    unsubscribeInstall ??= desktop.onUpdateInstallStateChange((state) => { install.value = state })
  })

  onUnmounted(() => {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers > 0) return
    unsubscribeInstall?.()
    unsubscribeInstall = undefined
    if (busyPoll) clearInterval(busyPoll)
    busyPoll = undefined
  })

  async function readJobsBusy() {
    try {
      const { busy } = await $fetch<{ busy: boolean }>('/api/jobs/busy')
      jobsBusy.value = busy
    }
    catch {
      // Left as it was rather than cleared: an unanswered question is not an
      // answer, and guessing "nothing is running" would hand back the restart
      // this exists to hold, over a single dropped request.
    }
  }

  /**
   * Only asked once there is something to restart into, and only until the
   * queue clears: the answer is needed for one button, and polling it from
   * launch would be a request every few seconds for nothing.
   */
  watch(() => install.value.state === 'ready', async (ready) => {
    if (busyPoll) clearInterval(busyPoll)
    busyPoll = undefined
    if (!ready) return
    await readJobsBusy()
    busyPoll = setInterval(() => { void readJobsBusy() }, JOBS_BUSY_POLL_MS)
  })

  const promptOpen = computed(() => promptShows(
    { offer: offer.value, answered: answered.value },
    { pageAllowsPrompt: route.meta.updatePrompt !== false },
  ))

  /** What the prompt offers right now: install, restart, or the download page. */
  const offers = computed(() => promptOffers({
    mode: mode.value,
    install: install.value,
    jobsBusy: jobsBusy.value,
  }))

  /**
   * Closes the prompt for this launch without remembering anything. A
   * downloaded Update still installs when the singer quits, which is what
   * makes this "Install when I quit" once there is something to install.
   */
  function later() {
    answered.value = true
  }

  /**
   * Downloads the Update. Nothing is fetched before this: an installer is well
   * over a hundred megabytes, and the singer has to ask for it.
   */
  async function installNow() {
    await desktop.installUpdate()
  }

  /**
   * Installs what was downloaded and relaunches, unless a Job is still
   * running. Named apart from the bridge call it wraps, which has no such
   * guard on it.
   */
  async function restartNow() {
    if (offers.value.restartBlocked) return
    await desktop.restartToUpdate()
  }

  /** Closes it for good: this Release, and anything not newer, stops being offered. */
  async function skip() {
    const version = offer.value?.version
    answered.value = true
    if (version) await desktop.skipUpdate(version)
    offer.value = null
  }

  function openReleasePage() {
    const url = offer.value?.url
    answered.value = true
    if (url) desktop.openExternal(url)
  }

  /**
   * A check the singer asked for. It ignores the switch and anything skipped,
   * and reopens the prompt when it finds something — asking is explicit, so a
   * previous "Skip this version" is not an answer to it.
   */
  async function checkNow() {
    if (checking.value) return
    checking.value = true
    lastCheck.value = null
    try {
      const checked = await desktop.checkForUpdateNow()
      lastCheck.value = checked ?? { state: 'failed' }
      if (checked?.state === 'available') {
        offer.value = checked.update
        answered.value = false
        // A failed install earlier in this session was about the Release that
        // was on offer then. Left in place it would show this new Update as
        // already broken, with only the download link.
        if (install.value.state === 'failed') install.value = { state: 'idle' }
      }
    }
    finally {
      checking.value = false
    }
  }

  async function setAutomatic(enabled: boolean) {
    automatic.value = enabled
    await desktop.setAutomaticUpdateChecks(enabled)
  }

  return {
    offer,
    promptOpen,
    offers,
    jobsBusy,
    mode,
    install,
    installNow,
    restartNow,
    checking,
    lastCheck,
    automatic,
    later,
    skip,
    openReleasePage,
    checkNow,
    setAutomatic,
  }
}
