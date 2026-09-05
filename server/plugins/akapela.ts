import { useAkapela } from '../lib/use-akapela'

/**
 * Opens the database and applies migrations as soon as the server boots, so
 * the worker (which waits for the database file) can start without anyone
 * having to open a page first.
 */
export default defineNitroPlugin(() => {
  useAkapela()
})
