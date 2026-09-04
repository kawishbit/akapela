import { resolve } from 'node:path'
import { createPresto, type Presto } from './presto'

let instance: Presto | undefined

/** The single Presto handle for this server process, created on first use. */
export function usePresto(): Presto {
  if (!instance) {
    // Nitro auto-import; resolved from nuxt.config runtimeConfig and NUXT_* env vars.
    const config = useRuntimeConfig()
    instance = createPresto({
      dataDir: resolve(String(config.dataDir)),
      migrationsDir: resolve(String(config.migrationsDir)),
      // Read here rather than from runtimeConfig so a self-hoster can set it
      // on the running container without rebuilding the image.
      geniusToken: process.env.PRESTO_GENIUS_TOKEN ?? '',
    })
  }
  return instance
}
