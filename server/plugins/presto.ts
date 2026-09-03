import { usePresto } from '../lib/use-presto'

/**
 * Opens the database and applies migrations as soon as the server boots, so
 * the worker (which waits for the database file) can start without anyone
 * having to open a page first.
 */
export default defineNitroPlugin(() => {
  usePresto()
})
