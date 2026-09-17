declare module '#app' {
  interface PageMeta {
    /** Whether the persistent player bar belongs on this page. Defaults to true. */
    playerBar?: boolean
    /** Whether the Desktop App may ask about an Update here. Defaults to true; false holds the prompt back until the singer leaves. */
    updatePrompt?: boolean
  }
}

/**
 * What the Desktop App's shell exposes to the page, and nothing more — the two
 * things that genuinely need the operating system, plus the version check
 * (ADR 0009: the shell stays thin). Absent in every browser, which is how the
 * app knows which of the two it is running in; `useDesktop()` is the only
 * place that should look.
 *
 * Kept in step by hand with `desktop/src/bridge.cts`, because `desktop/` is a
 * separate package with its own install — the same arm's length `apphost/`
 * keeps.
 */
declare global {
  interface DesktopUpdate {
    version: string
    url: string
  }

  type DesktopUpdateCheck =
    | { state: 'available', update: DesktopUpdate }
    | { state: 'current' }
    | { state: 'failed' }

  type DesktopUpdateInstallMode = 'in-place' | 'link'

  type DesktopUpdateInstallState =
    | { state: 'idle' }
    | { state: 'downloading', percent: number }
    | { state: 'ready', version: string }
    | { state: 'failed', message: string }

  interface DesktopLibraryChange {
    ok: boolean
    /** The folder now in use — unchanged when the singer cancelled or it was refused. */
    dir: string
    error?: string
    /** True when the picker was dismissed, which is not an error. */
    cancelled?: boolean
  }

  interface AkapelaDesktopBridge {
    desktop: true
    version: string
    platform: string
    libraryDir: () => Promise<string>
    chooseLibraryDir: () => Promise<DesktopLibraryChange>
    revealLibraryDir: () => Promise<void>
    update: () => Promise<DesktopUpdate | null>
    skipUpdate: (version: string) => Promise<void>
    checkForUpdateNow: () => Promise<DesktopUpdateCheck>
    automaticUpdateChecks: () => Promise<boolean>
    setAutomaticUpdateChecks: (enabled: boolean) => Promise<void>
    updateInstallMode: () => Promise<DesktopUpdateInstallMode>
    installUpdate: () => Promise<void>
    restartToUpdate: () => Promise<void>
    updateInstallState: () => Promise<DesktopUpdateInstallState>
    onUpdateInstallStateChange: (listener: (state: DesktopUpdateInstallState) => void) => () => void
    openExternal: (url: string) => Promise<void>
    isWindowMaximized: () => Promise<boolean>
    minimizeWindow: () => Promise<void>
    toggleMaximizeWindow: () => Promise<void>
    closeWindow: () => Promise<void>
    onWindowMaximizedChange: (listener: (maximized: boolean) => void) => () => void
  }

  interface Window {
    akapela?: AkapelaDesktopBridge
  }
}

export {}
