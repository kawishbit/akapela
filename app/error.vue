<script setup lang="ts">
import type { NuxtError } from '#app'
import { AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{ error: NuxtError }>()

const { theme } = useTheme()

// error.vue replaces app.vue's whole render tree, so the theme wiring app.vue
// normally does for `<html>` has to happen here too, or a themed error page
// would flash back to whatever the blocking script in nuxt.config.ts painted.
useHead(() => ({
  htmlAttrs: { 'data-theme': theme.value },
  meta: [{ name: 'theme-color', content: theme.value === 'light' ? '#ffffff' : '#121212' }],
}))

const isNotFound = computed(() => props.error.statusCode === 404)

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ground p-6 text-center text-text">
    <AlertTriangle class="size-10 text-negative" />
    <h1 class="text-lg font-semibold">
      {{ isNotFound ? "That page doesn't exist" : 'Something went wrong' }}
    </h1>
    <p class="max-w-sm text-sm text-text-muted">
      {{ isNotFound
        ? "The link you followed doesn't point anywhere."
        : (error.statusMessage || error.message || 'An unexpected error stopped the page from loading.') }}
    </p>
    <button
      type="button"
      class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:brightness-110"
      @click="goHome"
    >
      Back to your library
    </button>
  </div>
</template>
