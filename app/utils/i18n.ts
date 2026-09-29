import type { Composer } from 'vue-i18n'

/**
 * `useI18n().t`, for the plain functions under `app/utils/` that turn data
 * into words. They take it as an argument rather than reaching for the app,
 * so the suite can hand them one built from `en.json`.
 */
export type Translate = Composer['t']
