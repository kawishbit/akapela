import { promptOffers, promptShows, type UpdateOffer } from '~/utils/update-prompt'

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
  let unsubscribeInstall: (() => void) | undefined

  // What the launch check found, once the bridge has answered.
  watch(desktop.update, (found) => { if (found) offer.value = found }, { immediate: true })

  onMounted(async () => {
    if (!desktop.isDesktop.value) return
    automatic.value = await desktop.automaticUpdateChecks()
    mode.value = await desktop.updateInstallMode()
    install.value = await desktop.updateInstallState()
    // The download outlives any one component: the shell reports where it got
    // to, and the prompt follows it.
    unsubscribeInstall = desktop.onUpdateInstallStateChange((state) => { install.value = state })
  })

  onUnmounted(() => unsubscribeInstall?.())

  const promptOpen = computed(() => promptShows(
    { offer: offer.value, answered: answered.value },
    { pageAllowsPrompt: route.meta.updatePrompt !== false },
  ))

  /** What the prompt offers right now: install, restart, or the download page. */
  const offers = computed(() => promptOffers({ mode: mode.value, install: install.value }))

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

  /** Installs what was downloaded and relaunches. */
  async function restartToUpdate() {
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
    mode,
    install,
    installNow,
    restartToUpdate,
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
