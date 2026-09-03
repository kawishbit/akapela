import { defineEventHandler } from 'h3'
import { usePresto } from '../lib/use-presto'

/** Attaches the process-wide Presto handle to every request. */
export default defineEventHandler((event) => {
  event.context.presto = usePresto()
})
