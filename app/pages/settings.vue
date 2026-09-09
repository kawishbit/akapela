<script setup lang="ts">
import { ArrowLeft, Headphones, Settings2 } from 'lucide-vue-next'
import { LYRICS_PROVIDER_LABELS, type LyricsProviderName } from '~~/shared/lyrics'

const {
  lyricsProviders,
  defaultLyricsProvider,
  micProcessingDefault,
  monitoringDefault,
  saving,
  saveError,
  setDefaultLyricsProvider,
  setMicProcessingDefault,
  setMonitoringDefault,
} = useSettings()

function pickDefaultLyricsProvider(provider: LyricsProviderName) {
  if (provider === defaultLyricsProvider.value) return
  setDefaultLyricsProvider(provider)
}

useHead({ title: 'Settings · Akapela' })
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 pb-36 pt-6 sm:pb-28 sm:pt-8">
    <NuxtLink
      to="/"
      class="mb-4 inline-flex h-11 items-center gap-2 rounded-pill pr-4 text-sm font-bold text-text-muted transition hover:text-text"
    >
      <ArrowLeft class="size-4" />
      Library
    </NuxtLink>

    <h1 class="mb-6 text-2xl font-bold tracking-tight">
      Settings
    </h1>

    <div class="flex flex-col gap-4">
      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          Default Lyrics Provider
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          Where a newly imported Track looks its Lyrics up.
        </p>
        <div
          class="mt-3 flex flex-wrap items-center gap-1 rounded-pill bg-surface-mid p-1"
          role="group"
          aria-label="Default Lyrics Provider"
        >
          <button
            v-for="provider in lyricsProviders"
            :key="provider"
            type="button"
            class="inline-flex h-11 items-center gap-1.5 rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
            :class="provider === defaultLyricsProvider
              ? 'bg-text text-ground'
              : 'text-text-muted hover:text-text'"
            :aria-pressed="provider === defaultLyricsProvider"
            :disabled="saving"
            @click="pickDefaultLyricsProvider(provider)"
          >
            {{ LYRICS_PROVIDER_LABELS[provider] }}
          </button>
        </div>
      </section>

      <section class="rounded-[8px] bg-surface p-4 sm:p-5">
        <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          Recording
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          What a new recording session on the Sing page starts with. Either can still be
          switched for that session alone.
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex h-12 items-center gap-1.5 rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
            :class="micProcessingDefault ? 'bg-accent text-ground hover:brightness-110' : 'bg-surface-mid text-text-muted hover:text-text'"
            :aria-pressed="micProcessingDefault"
            :disabled="saving"
            @click="setMicProcessingDefault(!micProcessingDefault)"
          >
            <Settings2 class="size-3.5" />
            Processing {{ micProcessingDefault ? 'on' : 'off' }}
          </button>

          <button
            type="button"
            class="inline-flex h-12 items-center gap-1.5 rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
            :class="monitoringDefault ? 'bg-accent text-ground hover:brightness-110' : 'bg-surface-mid text-text-muted hover:text-text'"
            :aria-pressed="monitoringDefault"
            :disabled="saving"
            @click="setMonitoringDefault(!monitoringDefault)"
          >
            <Headphones class="size-3.5" />
            Monitoring {{ monitoringDefault ? 'on' : 'off' }}
          </button>
        </div>
      </section>

      <p
        v-if="saveError"
        class="text-sm text-negative"
        role="alert"
      >
        {{ saveError }}
      </p>
    </div>
  </main>
</template>
