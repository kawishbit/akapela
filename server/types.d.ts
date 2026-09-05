import type { Akapela } from './lib/akapela'

declare module 'h3' {
  interface H3EventContext {
    akapela: Akapela
  }
}

export {}
