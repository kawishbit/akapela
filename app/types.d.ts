declare module '#app' {
  interface PageMeta {
    /** Whether the persistent player bar belongs on this page. Defaults to true. */
    playerBar?: boolean
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
    openExternal: (url: string) => Promise<void>
  }

  interface Window {
    akapela?: AkapelaDesktopBridge
  }
}

export {}
