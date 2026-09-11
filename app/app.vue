<script setup lang="ts">
const route = useRoute()

// The Sing page fills the screen with Lyrics and carries its own transport.
const showPlayerBar = computed(() => route.meta.playerBar !== false)

const { theme } = useTheme()

// The blocking script in `nuxt.config.ts` paints the right theme before this
// ever runs; this keeps the `<html>` attribute and the mobile chrome's own
// color in sync afterward, including a live system-preference change or a
// choice made on the Settings page.
useHead(() => ({
  htmlAttrs: { 'data-theme': theme.value },
  meta: [{ name: 'theme-color', content: theme.value === 'light' ? '#ffffff' : '#121212' }],
}))
</script>

<template>
  <div class="min-h-dvh bg-ground text-text">
    <TitleBar />
    <NuxtPage />
    <PlayerBar v-if="showPlayerBar" />
  </div>
</template>
