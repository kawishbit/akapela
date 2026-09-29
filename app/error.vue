<script setup lang="ts">
import type { NuxtError } from '#app'
import { AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const { theme } = useTheme()
const { language } = useLanguage()

// error.vue replaces app.vue's whole render tree, so the theme wiring app.vue
// normally does for `<html>` has to happen here too, or a themed error page
// would flash back to whatever the blocking script in nuxt.config.ts painted.
useHead(() => ({
  htmlAttrs: { 'lang': language.value, 'data-theme': theme.value },
  meta: [{ name: 'theme-color', content: theme.value === 'light' ? '#ffffff' : '#121212' }],
}))

const isNotFound = computed(() => props.error.statusCode === 404)

/** Anything but a missing page goes through the same words every other failure does. */
const failure = computed(() => describeError(props.error, t))

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ground p-6 text-center text-text">
    <AlertTriangle class="size-10 text-negative" />
    <h1 class="text-lg font-semibold">
      {{ isNotFound ? t('errorPage.notFoundTitle') : failure.message }}
    </h1>
    <p
      v-if="isNotFound"
      class="max-w-sm text-sm text-text-muted"
    >
      {{ t('errorPage.notFoundBody') }}
    </p>
    <details
      v-else-if="failure.details"
      class="max-w-sm text-sm text-text-muted"
    >
      <summary class="cursor-pointer select-none text-xs font-bold">
        {{ t('errors.details') }}
      </summary>
      <pre class="mt-1 whitespace-pre-wrap break-words text-left font-mono text-xs">{{ failure.details }}</pre>
    </details>
    <button
      type="button"
      class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:brightness-110"
      @click="goHome"
    >
      {{ t('errorPage.back') }}
    </button>
  </div>
</template>
