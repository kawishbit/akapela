export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  // A key another Language hasn't translated yet shows in English, quietly.
  // `scripts/i18n-completeness.ts` is where a gap is reported, not the console.
  fallbackWarn: false,
  missingWarn: false,
}))
