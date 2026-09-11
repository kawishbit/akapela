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
