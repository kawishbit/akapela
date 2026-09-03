<script setup lang="ts">
import { Play } from 'lucide-vue-next'
</script>

<template>
  <footer
    class="fixed inset-x-0 bottom-0 z-20 bg-ground/95 shadow-[0_-1px_0_var(--color-surface-mid)] backdrop-blur"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <div class="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
      <div class="size-11 shrink-0 rounded-[6px] bg-surface-mid" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-bold text-text">
          Nothing playing
        </p>
        <p class="truncate text-xs text-text-muted">
          Import a track to get started
        </p>
      </div>
      <button
        type="button"
        class="flex size-10 items-center justify-center rounded-full bg-surface-mid text-text-muted"
        disabled
        aria-label="Play"
      >
        <Play class="size-4" fill="currentColor" />
      </button>
    </div>
  </footer>
</template>
