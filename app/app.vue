<script setup lang="ts">
const route = useRoute()

// The Sing page fills the screen with Lyrics and carries its own transport.
const showPlayerBar = computed(() => route.meta.playerBar !== false)

const { theme } = useTheme()
const { isDesktop } = useDesktop()

// In the Desktop App the window itself never scrolls. The title bar is a fixed
// row and the page scrolls inside the element below it, so the scrollbar starts
// under the bar instead of running up alongside the window controls — on every
// platform, since the bar reserves that strip everywhere (`TitleBar.vue`). A
// browser keeps its own chrome, so there the wrapper is `display: contents` and
// the document scrolls exactly as it always has.
const scroller = useTemplateRef<HTMLElement>('scroller')

// The document scroll resets itself on navigation; an element's does not.
watch(() => route.fullPath, () => scroller.value?.scrollTo({ top: 0 }))

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
  <div
    class="bg-ground text-text"
    :class="isDesktop ? 'flex h-dvh flex-col overflow-hidden' : 'min-h-dvh'"
  >
    <TitleBar />
    <div
      ref="scroller"
      :class="isDesktop ? 'min-h-0 flex-1 overflow-y-auto' : 'contents'"
    >
      <NuxtPage />
    </div>
    <PlayerBar v-if="showPlayerBar" />
    <UpdatePrompt />
  </div>
</template>
