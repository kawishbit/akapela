/**
 * Whether this is the Desktop App, and the little the shell can do that a
 * browser cannot.
 *
 * The bridge is only there when Akapela is running in its own window
 * (`desktop/src/preload.cts`); in a browser — including a browser pointed at a
 * compose instance — everything here is inert and the controls that depend on
 * it are simply absent. Nothing else in the app should reach for
 * `window.akapela`.
 */
export function useDesktop() {
  const bridge = shallowRef<AkapelaDesktopBridge | null>(null)
  const libraryDir = ref<string | null>(null)
  const update = ref<DesktopUpdate | null>(null)

  onMounted(async () => {
    // Server-rendered first, so this can only be answered in the browser.
    const found = window.akapela
    if (!found) return
    bridge.value = found
    libraryDir.value = await found.libraryDir().catch(() => null)
    update.value = await found.update().catch(() => null)
  })

  /**
   * Opens the native folder picker. Resolves to what happened, so the page can
   * say why a folder was refused; on success the shell restarts the server and
   * the window comes back on the new library on its own.
   */
  async function chooseLibraryDir(): Promise<DesktopLibraryChange | null> {
    const found = bridge.value
    if (!found) return null
    const result = await found.chooseLibraryDir()
    if (result.ok) libraryDir.value = result.dir
    return result
  }

  return {
    isDesktop: computed(() => bridge.value !== null),
    version: computed(() => bridge.value?.version ?? null),
    libraryDir,
    update,
    chooseLibraryDir,
    revealLibraryDir: () => bridge.value?.revealLibraryDir(),
    openExternal: (url: string) => bridge.value?.openExternal(url),
  }
}
