import { defineEventHandler } from 'h3'
import { version } from '../../package.json'

/**
 * Which app this is, and which Release. What a Connected Desktop App asks
 * before it loads anything: `app` is how it tells an Akapela from any other
 * web server at that address, and `version` is how it refuses one newer than
 * itself (`desktop/src/connection.ts`). Cheap on purpose; it touches nothing.
 */
export default defineEventHandler(() => ({ app: 'akapela', version }))
