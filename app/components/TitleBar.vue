<script setup lang="ts">
import { ChevronLeft, ChevronRight, Copy, Minus, Settings, Square, X } from 'lucide-vue-next'

/**
 * Akapela's own title bar, replacing the OS default the way Spotify's does.
 * Drawn in two windows (`useTitleBar()`), and absent in a browser tab, which
 * keeps its own chrome.
 *
 * In the Desktop App (`desktop/src/titlebar.ts`), macOS keeps its native
 * traffic lights, inset into this strip rather than sitting above it, so this
 * bar only reserves the draggable space around them on the left. Everywhere
 * else the window has no frame at all, so the right end of this bar draws
 * minimize/maximize/close itself.
 *
 * In the installed PWA the browser keeps its own window controls — a page
 * cannot remove them — and lays them over whichever end of this strip the OS
 * puts them at. `env(titlebar-area-*)` says where the rest is, so the bar pads
 * that end clear and takes the overlay's height, which the browser fixes and
 * which is shorter than the Desktop App's; the buttons shrink to fit it.
 */
const { platform, maximized, minimizeWindow, toggleMaximizeWindow, closeWindow } = useDesktop()
const { mode } = useTitleBar()
const { canGoBack, canGoForward, back, forward } = useNavigationHistory()

const isMac = computed(() => platform.value === 'darwin')
const overlay = computed(() => mode.value === 'overlay')
const navButton = computed(() => overlay.value ? 'size-7' : 'size-9')
</script>

<template>
  <div
    v-if="mode"
    class="z-50 flex shrink-0 select-none items-center bg-ground [-webkit-app-region:drag] [app-region:drag]"
    :class="overlay
      ? 'titlebar-overlay'
      : ['h-11', isMac ? 'pl-24 pr-3' : 'pl-2']"
  >
    <div
      class="flex h-full items-center [-webkit-app-region:no-drag] [app-region:no-drag]"
      :class="overlay ? 'gap-1.5' : 'gap-2'"
    >
      <img
        src="/logo.svg"
        alt=""
        :class="overlay ? 'mr-4 size-5 rounded-[5px]' : 'mr-5 size-7 rounded-[7px]'"
      >
      <button
        type="button"
        class="flex items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:opacity-40 disabled:hover:bg-surface-mid"
        :class="navButton"
        :disabled="!canGoBack"
        aria-label="Back"
        @click="back"
      >
        <ChevronLeft class="size-4" />
      </button>
      <button
        type="button"
        class="flex items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:opacity-40 disabled:hover:bg-surface-mid"
        :class="navButton"
        :disabled="!canGoForward"
        aria-label="Forward"
        @click="forward"
      >
        <ChevronRight class="size-4" />
      </button>
    </div>

    <div class="flex-1" />

    <div
      class="flex h-full items-center [-webkit-app-region:no-drag] [app-region:no-drag]"
      :class="overlay ? 'gap-1' : 'gap-2'"
    >
      <QueueLink :size="overlay ? 'xs' : 'sm'" />
      <JobsLink :size="overlay ? 'xs' : 'sm'" />
      <NuxtLink
        to="/settings"
        class="flex items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
        :class="navButton"
        aria-label="Settings"
      >
        <Settings :class="overlay ? 'size-4' : 'size-5'" />
      </NuxtLink>
    </div>

    <div
      v-if="mode === 'desktop' && !isMac"
      class="ml-2 flex h-full items-stretch [-webkit-app-region:no-drag]"
    >
      <button
        type="button"
        class="flex w-12 items-center justify-center text-text-muted transition hover:bg-surface-mid hover:text-text"
        aria-label="Minimize"
        @click="minimizeWindow"
      >
        <Minus class="size-5" />
      </button>
      <button
        type="button"
        class="flex w-12 items-center justify-center text-text-muted transition hover:bg-surface-mid hover:text-text"
        :aria-label="maximized ? 'Restore' : 'Maximize'"
        @click="toggleMaximizeWindow"
      >
        <Copy
          v-if="maximized"
          class="size-4 -scale-x-100"
        />
        <Square
          v-else
          class="size-4"
        />
      </button>
      <button
        type="button"
        class="flex w-12 items-center justify-center text-text-muted transition hover:bg-negative hover:text-white"
        aria-label="Close"
        @click="closeWindow"
      >
        <X class="size-5" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * The strip the browser leaves the page, between its own controls: Windows
 * and Linux put them on the right, macOS on the left, and these cover both.
 * The fallbacks only matter for the instant before the overlay reports in.
 */
.titlebar-overlay {
  height: env(titlebar-area-height, 2.25rem);
  padding-left: calc(env(titlebar-area-x, 0px) + 0.5rem);
  padding-right: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 0.5rem);
}
</style>
