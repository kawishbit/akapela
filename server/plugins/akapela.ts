import { useAkapela } from '../lib/use-akapela'

/**
 * Opens the database and applies migrations as soon as the server boots, so
 * the worker (which waits for the database file) can start without anyone
 * having to open a page first. Starts working out the hardware too, so
 * neither Settings nor the first Separation waits on it.
 */
export default defineNitroPlugin(() => {
  void useAkapela().hardware()
})
