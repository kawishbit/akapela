import type { Presto } from './lib/presto'

declare module 'h3' {
  interface H3EventContext {
    presto: Presto
  }
}

export {}
