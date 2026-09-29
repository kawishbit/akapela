/**
 * Removes a service worker left on this origin by a production build, in dev
 * only. The PWA is off under `pnpm dev` (`devOptions` in `nuxt.config.ts`), so
 * nothing would ever replace one registered earlier by `.output` or compose on
 * the same `localhost` port. It keeps serving its precached `public/` scripts,
 * the audio worklets among them, to whatever code the dev server now sends:
 * an engine and a worklet from two different versions of the app.
 *
 * A page the old worker controls is still controlled after unregistering, so
 * it reloads once, uncontrolled.
 */
export default defineNuxtPlugin({
  name: 'akapela:dev-service-worker',
  setup() {
    if (!import.meta.dev || !('serviceWorker' in navigator)) return
    // Not awaited: the app never waits on this, and Nuxt's async-context
    // transform of `await` inside a plugin's setup is best kept out of it.
    removeServiceWorkers().catch((error) => {
      console.warn('A leftover service worker could not be removed:', error instanceof Error ? error.message : error)
    })
  },
})

async function removeServiceWorkers(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations()
  if (registrations.length === 0) return
  await Promise.all(registrations.map(registration => registration.unregister()))
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map(key => caches.delete(key)))
  }
  console.warn('Removed a service worker left by a production build on this origin.')
  if (navigator.serviceWorker.controller) location.reload()
}
