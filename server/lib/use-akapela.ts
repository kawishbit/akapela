import { resolve } from 'node:path'
import { createAkapela, type Akapela } from './akapela'

let instance: Akapela | undefined

/** The single Akapela handle for this server process, created on first use. */
export function useAkapela(): Akapela {
  if (!instance) {
    // Nitro auto-import; resolved from nuxt.config runtimeConfig and NUXT_* env vars.
    const config = useRuntimeConfig()
    instance = createAkapela({
      dataDir: resolve(String(config.dataDir)),
      migrationsDir: resolve(String(config.migrationsDir)),
      // Read here rather than from runtimeConfig so a self-hoster can set it
      // on the running container without rebuilding the image.
      geniusToken: process.env.AKAPELA_GENIUS_TOKEN ?? '',
    })
  }
  return instance
}
