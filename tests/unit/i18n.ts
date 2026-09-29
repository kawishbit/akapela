import { createI18n } from 'vue-i18n'
import en from '../../i18n/locales/en.json'
import type { Translate } from '../../app/utils/i18n'

/** `useI18n().t` as the app has it in English, for the plain functions that take one. */
export function englishTranslate(): Translate {
  return createI18n({ legacy: false, locale: 'en', messages: { en } }).global.t as Translate
}
