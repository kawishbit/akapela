import { defineEventHandler } from 'h3'
import { useAkapela } from '../lib/use-akapela'

/** Attaches the process-wide Akapela handle to every request. */
export default defineEventHandler((event) => {
  event.context.akapela = useAkapela()
})
