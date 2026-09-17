<script setup lang="ts">
import { CloudDownload } from 'lucide-vue-next'

/**
 * Asks the singer about an Update, once per launch.
 *
 * Lives here rather than in the shell because a native dialog would appear the
 * moment the launch check finished — possibly mid-Take (ADR 0009's amendment
 * on Updates). `updatePrompt: false` in a page's meta holds it back; it opens
 * on the next page that allows it.
 */

const { isDesktop, version, openExternal } = useDesktop()
const { offer, promptOpen, later, skip, openReleasePage } = useUpdates()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isDesktop && promptOpen && offer"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      @click.self="later"
      @keydown.esc="later"
    >
      <div
        class="w-full max-w-sm rounded-[8px] bg-card p-6 shadow-[var(--shadow-heavy)]"
        role="alertdialog"
        aria-modal="true"
        aria-label="An update is available"
      >
        <h2 class="flex items-center gap-2 text-lg font-semibold leading-[1.3]">
          <CloudDownload class="size-5 text-accent" />
          Akapela {{ offer.version }} is available
        </h2>
        <p class="mt-2 text-sm text-text-muted">
          You're running {{ version }}.
          <button
            type="button"
            class="font-bold underline underline-offset-2 hover:text-accent"
            @click="openExternal(offer.url)"
          >
            What's new
          </button>
        </p>

        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="rounded-pill px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
            @click="skip"
          >
            Skip this version
          </button>
          <button
            type="button"
            class="rounded-pill px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
            @click="later"
          >
            Later
          </button>
          <button
            type="button"
            class="rounded-pill bg-text px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-ground transition hover:brightness-90"
            @click="openReleasePage"
          >
            Update now
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
