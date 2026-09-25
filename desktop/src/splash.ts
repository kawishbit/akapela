/**
 * The two pages the shell itself renders: "starting up" and "that did not
 * work". Everything else the singer ever sees is the Nuxt app over http.
 *
 * Inline `data:` URLs rather than files, because the moment there is an
 * `index.html` in the app someone will be tempted to load the real app from
 * `file://` — and `file://` is not a secure context, which would take
 * `getUserMedia` and the AudioWorklet engines with it (ADR 0009).
 *
 * The colours are the app's own dark ground, so the window does not flash
 * white before the library appears.
 */

function page(body: string): string {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Akapela</title>
<style>
  :root { color-scheme: dark }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #121212; color: #f5f5f5; text-align: center;
    font: 14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-user-select: none; user-select: none;
  }
  main { max-width: 34rem; padding: 2rem }
  h1 { font-size: 1.1rem; font-weight: 700; margin: 0 0 .5rem }
  p { color: #a3a3a3; margin: 0 0 .5rem; white-space: pre-wrap }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #f5f5f5 }
  .spinner {
    width: 26px; height: 26px; margin: 0 auto 1.25rem; border-radius: 50%;
    border: 3px solid #333; border-top-color: #f5f5f5; animation: spin 900ms linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg) } }
</style></head><body><main>${body}</main></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, character => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] ?? character
  ))
}

/** Shown while the server starts and the database migrates itself. */
export function loadingPage(): string {
  return page('<div class="spinner"></div><h1>Starting Akapela…</h1><p>Opening your library.</p>')
}

/** Shown when the server could not be started or reached, with what actually went wrong. */
export function errorPage(title: string, detail: string): string {
  return page(`<h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>`)
}

/**
 * Where a shell screen's buttons and forms go. Never a real host (`.invalid`
 * is reserved and resolves nowhere): the window's `will-navigate` handler
 * catches the navigation, cancels it, and does what it names. No script runs
 * on these pages and no preload is involved, so a shell screen can ask for
 * exactly these things and nothing else.
 */
export const SHELL_ACTION_ORIGIN = 'http://akapela-shell.invalid'

export type ShellAction =
  | { kind: 'use-local' }
  | { kind: 'test', url: string }
  | { kind: 'connect', url: string }
  | { kind: 'retry' }
  | { kind: 'change-server' }
  | { kind: 'update' }

const SIMPLE_ACTIONS = ['use-local', 'retry', 'change-server', 'update'] as const

export function shellActionUrl(kind: (typeof SIMPLE_ACTIONS)[number]): string {
  return `${SHELL_ACTION_ORIGIN}/${kind}`
}

/** The action a navigation asks for, or null when it is not one of the shell's own. */
export function parseShellAction(target: string): ShellAction | null {
  let parsed: URL
  try {
    parsed = new URL(target)
  }
  catch {
    return null
  }
  if (parsed.origin !== SHELL_ACTION_ORIGIN) return null
  const kind = parsed.pathname.slice(1)
  if (kind === 'test' || kind === 'connect') return { kind, url: parsed.searchParams.get('url') ?? '' }
  return (SIMPLE_ACTIONS as readonly string[]).includes(kind)
    ? { kind: kind as (typeof SIMPLE_ACTIONS)[number] }
    : null
}

const BUTTON_STYLE = `
  .actions { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: center; margin-top: 1.25rem }
  a.button, button {
    display: inline-block; border: 0; border-radius: 999px; padding: .7rem 1.3rem; cursor: pointer;
    font: 700 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: 1.2px;
    text-transform: uppercase; text-decoration: none; background: #2a2a2a; color: #f5f5f5;
  }
  a.button.primary, button.primary { background: #1ed760; color: #10150f }
  input {
    width: 100%; box-sizing: border-box; margin-top: .75rem; padding: .7rem 1rem; border-radius: 999px;
    border: 1px solid #555; background: #1f1f1f; color: #f5f5f5; font: 15px system-ui, sans-serif;
  }
  .card { background: #1a1a1a; border-radius: 10px; padding: 1.25rem; margin-top: 1rem; text-align: left }
  .card h2 { font-size: 1rem; margin: 0 0 .25rem }
  .note { font-size: 12px }
  .ok { color: #1ed760 } .bad { color: #f3727f }
`

function actionPage(body: string): string {
  return page(`<style>${BUTTON_STYLE}</style>${body}`)
}

export interface ChoicePageOptions {
  /** What was last typed, so a test or a refusal does not make the singer type it again. */
  url?: string
  /** The outcome of a connection test or a refused address. */
  message?: { text: string, ok: boolean }
}

/**
 * First launch, and **Change server…**: this computer, or a server elsewhere.
 * Akapela has no accounts, which is said here in one line, because it decides
 * where a server belongs.
 */
export function choicePage(options: ChoicePageOptions = {}): string {
  const message = options.message
    ? `<p class="${options.message.ok ? 'ok' : 'bad'}" role="status">${escapeHtml(options.message.text)}</p>`
    : ''
  return actionPage(`
    <h1>Where is your Akapela?</h1>
    <div class="card">
      <h2>Use this computer</h2>
      <p>Akapela runs here, with its library in a folder on this computer.</p>
      <div class="actions" style="justify-content:flex-start">
        <a class="button primary" href="${shellActionUrl('use-local')}">Use this computer</a>
      </div>
    </div>
    <form class="card" action="${SHELL_ACTION_ORIGIN}/connect" method="get">
      <h2>Connect to a server</h2>
      <p>Open the Akapela already running on your own server, and sing from here.</p>
      <input name="url" type="text" autocomplete="off" spellcheck="false" autofocus required
        placeholder="http://192.168.1.20:3000" aria-label="Server address" value="${escapeHtml(options.url ?? '')}">
      ${message}
      <p class="note">Akapela has no accounts: anyone who can reach the server can use it, so keep it on your own network or behind a VPN.</p>
      <div class="actions" style="justify-content:flex-start">
        <button type="submit" formaction="${SHELL_ACTION_ORIGIN}/test">Test connection</button>
        <button type="submit" class="primary">Connect</button>
      </div>
    </form>`)
}

/**
 * The server is not answering — at launch, or after it went away mid-song.
 * The shell keeps asking on its own while this shows, so a rebooted server
 * brings the window back without anyone touching it.
 */
export function unreachablePage(url: string, detail: string, retryInSeconds: number): string {
  return actionPage(`
    <div class="spinner"></div>
    <h1>Waiting for your Akapela</h1>
    <p>${escapeHtml(detail)}</p>
    <p>Trying <code>${escapeHtml(url)}</code> again in ${retryInSeconds} seconds.</p>
    <div class="actions">
      <a class="button primary" href="${shellActionUrl('retry')}">Retry now</a>
      <a class="button" href="${shellActionUrl('change-server')}">Change server…</a>
    </div>`)
}

/**
 * The server is a newer Release than this app. Its pages may ask this window
 * for things it cannot do, so they are not loaded; the fix is to update the app.
 */
export function tooNewPage(serverVersion: string, shellVersion: string): string {
  return actionPage(`
    <h1>This app needs updating</h1>
    <p>Your server runs Akapela ${escapeHtml(serverVersion)}, and this app is ${escapeHtml(shellVersion)}.
Update the app to connect to it.</p>
    <div class="actions">
      <a class="button primary" href="${shellActionUrl('update')}">Get the Update</a>
      <a class="button" href="${shellActionUrl('change-server')}">Change server…</a>
    </div>`)
}
