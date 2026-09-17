<script setup lang="ts">
import { CloudDownload, Loader2 } from 'lucide-vue-next'

/**
 * Asks the singer about an Update, once per launch.
 *
 * Lives here rather than in the shell because a native dialog would appear the
 * moment the launch check finished — possibly mid-Take (ADR 0009's amendment
 * on Updates). `updatePrompt: false` in a page's meta holds it back; it opens
 * on the next page that allows it.
 *
 * What the buttons do depends on the platform: Windows and a launched AppImage
 * install the Update here, and everything else — macOS above all, which will
 * not update an unsigned app — opens the download page instead.
 */

const { isDesktop, version, openExternal } = useDesktop()
const {
  offer,
  promptOpen,
  offers,
  install,
  later,
  skip,
  openReleasePage,
  installNow,
  restartNow,
} = useUpdates()

function dismiss() {
  if (offers.value.dismissable) later()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isDesktop && promptOpen && offer"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      @click.self="dismiss"
      @keydown.esc="dismiss"
    >
      <div
        class="w-full max-w-sm rounded-[8px] bg-card p-6 shadow-[var(--shadow-heavy)]"
        role="alertdialog"
        aria-modal="true"
        aria-label="An Update is available"
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

        <p
          v-if="install.state === 'failed'"
          class="mt-2 text-sm text-negative"
          role="alert"
        >
          Akapela couldn't install this Update ({{ install.message }}). You can download it yourself
          instead — your library isn't affected either way.
        </p>
        <p
          v-else-if="install.state === 'ready'"
          class="mt-2 text-sm text-text-muted"
        >
          Downloaded and ready. Akapela restarts to finish, or installs it the next time you quit.
        </p>

        <p
          v-if="offers.restartBlocked"
          class="mt-2 text-sm text-text-muted"
          role="status"
        >
          A Job is still running — restarting would start it over. You can install on quit, or wait
          for it to finish.
        </p>

        <!-- A determinate bar: electron-updater reports real bytes, so there is
             no reason to show a spinner and hope. -->
        <div
          v-if="offers.act === 'downloading'"
          class="mt-4"
        >
          <div class="h-1.5 overflow-hidden rounded-pill bg-surface-mid">
            <div
              class="h-full rounded-pill bg-accent transition-[width] duration-300"
              :style="{ width: `${offers.progress ?? 0}%` }"
            />
          </div>
          <p class="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
            <Loader2 class="size-3.5 animate-spin" />
            Downloading… {{ offers.progress ?? 0 }}%
          </p>
        </div>

        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <template v-if="offers.act === 'restart'">
            <button
              type="button"
              class="rounded-pill px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
              @click="later"
            >
              Install when I quit
            </button>
            <button
              type="button"
              class="rounded-pill bg-text px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-ground transition hover:brightness-90 disabled:opacity-60 disabled:hover:brightness-100"
              :disabled="offers.restartBlocked"
              @click="restartNow"
            >
              Restart now
            </button>
          </template>

          <template v-else-if="offers.act === 'downloading'">
            <button
              type="button"
              class="rounded-pill bg-surface-mid px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text-muted"
              disabled
            >
              Downloading
            </button>
          </template>

          <template v-else>
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
              @click="offers.act === 'install' ? installNow() : openReleasePage()"
            >
              {{ offers.act === 'install' ? 'Update now' : 'Open download page' }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
