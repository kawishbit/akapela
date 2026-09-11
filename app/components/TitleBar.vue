<script setup lang="ts">
import { ChevronLeft, ChevronRight, Copy, Minus, Settings, Square, X } from 'lucide-vue-next'

/**
 * Akapela's own title bar, replacing the OS default the way Spotify's does
 * (`desktop/src/titlebar.ts`). Absent entirely outside the Desktop App: a
 * browser — including one pointed at a compose instance — keeps its own
 * chrome, and this component renders nothing.
 *
 * macOS keeps its native traffic lights, inset into this strip rather than
 * sitting above it, so they carry minimize/maximize/close there and this bar
 * only reserves the draggable space around them, on the left. Everywhere
 * else the window has no frame at all, so the right end of this bar draws
 * that trio itself.
 */
const { isDesktop, platform, maximized, minimizeWindow, toggleMaximizeWindow, closeWindow } = useDesktop()
const { canGoBack, canGoForward, back, forward } = useNavigationHistory()

const isMac = computed(() => platform.value === 'darwin')
</script>

<template>
  <div
    v-if="isDesktop"
    class="flex h-[38px] shrink-0 select-none items-center bg-ground [-webkit-app-region:drag]"
    :class="isMac ? 'pl-20 pr-2' : 'pl-2'"
  >
    <div class="flex h-full items-center gap-1 [-webkit-app-region:no-drag]">
      <img
        src="/logo.svg"
        alt=""
        class="size-5 rounded-[4px]"
      >
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:opacity-40 disabled:hover:bg-surface-mid"
        :disabled="!canGoBack"
        aria-label="Back"
        @click="back"
      >
        <ChevronLeft class="size-4" />
      </button>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded-full bg-surface-mid text-text transition hover:bg-card disabled:opacity-40 disabled:hover:bg-surface-mid"
        :disabled="!canGoForward"
        aria-label="Forward"
        @click="forward"
      >
        <ChevronRight class="size-4" />
      </button>
    </div>

    <div class="flex-1" />

    <div class="flex h-full items-center gap-1 [-webkit-app-region:no-drag]">
      <NuxtLink
        to="/settings"
        class="flex size-7 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
        aria-label="Settings"
      >
        <Settings class="size-4" />
      </NuxtLink>
    </div>

    <div
      v-if="!isMac"
      class="ml-1 flex h-full items-stretch [-webkit-app-region:no-drag]"
    >
      <button
        type="button"
        class="flex w-12 items-center justify-center text-text-muted transition hover:bg-surface-mid hover:text-text"
        aria-label="Minimize"
        @click="minimizeWindow"
      >
        <Minus class="size-4" />
      </button>
      <button
        type="button"
        class="flex w-12 items-center justify-center text-text-muted transition hover:bg-surface-mid hover:text-text"
        :aria-label="maximized ? 'Restore' : 'Maximize'"
        @click="toggleMaximizeWindow"
      >
        <Copy
          v-if="maximized"
          class="size-3.5 -scale-x-100"
        />
        <Square
          v-else
          class="size-3.5"
        />
      </button>
      <button
        type="button"
        class="flex w-12 items-center justify-center text-text-muted transition hover:bg-negative hover:text-white"
        aria-label="Close"
        @click="closeWindow"
      >
        <X class="size-4" />
      </button>
    </div>
  </div>
</template>
