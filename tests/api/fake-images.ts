/**
 * The web as far as cover art is concerned. Album art is the one thing the app
 * fetches that is not behind a Lyrics Provider, so tests answer it here rather
 * than reaching a real image host. A test changes what comes back by setting
 * the fields before the call that reads them.
 */
export function createFakeImages() {
  const state = {
    /** URLs the app asked for, in order. */
    requested: [] as string[],
    /** The bytes every request is answered with. */
    body: new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]),
    contentType: 'image/jpeg',
    status: 200,
    /** When set, the request fails the way an unreachable host does. */
    error: null as Error | null,
  }

  const fetch = (async (input: string | URL) => {
    state.requested.push(String(input))
    if (state.error) throw state.error
    return new Response(state.status < 400 ? state.body : null, {
      status: state.status,
      headers: { 'content-type': state.contentType },
    })
  }) as typeof globalThis.fetch

  return Object.assign(state, { fetch })
}
