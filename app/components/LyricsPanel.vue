<script setup lang="ts">
import { ClipboardPaste, Loader2, Pencil, RefreshCw } from 'lucide-vue-next'
import type { TrackDetail } from '~~/server/lib/tracks'
import {
  MANUAL_LYRICS_MAX_LENGTH,
  lyricsText,
  type LyricsProviderName,
} from '~~/shared/lyrics'
import type { ErrorText } from '~/utils/errors'

const props = defineProps<{ track: TrackDetail }>()
const emit = defineEmits<{ changed: [track: TrackDetail] }>()

const { t } = useI18n()

const { lyricsProviders, defaultLyricsProvider, setDefaultLyricsProvider, saving: savingDefault }
  = useSettings()

const busy = ref(false)
/** The provider being fetched from right now, so its button is the one that spins. */
const fetching = ref<LyricsProviderName | null>(null)
const actionError = ref<ErrorText | null>(null)

/** The fetch the singer is being asked about, held until they answer the dialog. */
const pendingFetch = ref<LyricsProviderName | null>(null)

const editing = ref(false)
const draft = ref('')

const lyrics = computed(() => props.track.lyrics)
const hasSong = computed(() => Boolean(props.track.songTitle))

/** A Lyrics Provider as a singer reads it: a service's own name, or Manual in their Language. */
function providerName(provider: LyricsProviderName): string {
  return t(`lyricsProviders.${provider}`)
}

const summary = computed(() => {
  if (!lyrics.value) return null
  const count = lyrics.value.lines.length
  const params = { provider: providerName(lyrics.value.provider), count }
  return lyrics.value.kind === 'synced'
    ? t('lyricsPanel.summarySynced', params, count)
    : t('lyricsPanel.summaryPlain', params, count)
})

/** Why there are no Lyrics yet, in the words that say what to do about it. */
const emptyReason = computed(() => {
  if (props.track.lyricsError) {
    return describeFailure(props.track.lyricsFailure ?? null, props.track.lyricsError, t).message
  }
  if (!hasSong.value) return t('lyricsPanel.noSong')
  if (props.track.lyricsProvider === 'manual') return t('lyricsPanel.manual')
  return t('lyricsPanel.notFound', { provider: providerName(props.track.lyricsProvider) })
})

const canSetDefault = computed(() =>
  props.track.lyricsProvider !== defaultLyricsProvider.value
  && lyricsProviders.value.includes(props.track.lyricsProvider))

/** Looks the Lyrics up in a provider, asking first when that would replace words the singer typed. */
async function fetchFrom(provider: LyricsProviderName, overwriteManual = false) {
  busy.value = true
  fetching.value = provider
  actionError.value = null
  try {
    const detail = await $fetch<TrackDetail>(`/api/tracks/${props.track.id}/lyrics`, {
      method: 'POST',
      body: { provider, overwriteManual },
    })
    pendingFetch.value = null
    editing.value = false
    emit('changed', detail)
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode === 409) pendingFetch.value = provider
    else actionError.value = describeError(error, t)
  }
  finally {
    busy.value = false
    fetching.value = null
  }
}

function pick(provider: LyricsProviderName) {
  if (provider === props.track.lyricsProvider) return
  fetchFrom(provider)
}

function startEditing() {
  draft.value = lyrics.value ? lyricsText(lyrics.value.lines) : ''
  editing.value = true
}

/** Saves what the singer typed, which makes the Lyrics theirs whatever they were before. */
async function saveTyped() {
  busy.value = true
  actionError.value = null
  try {
    const detail = await $fetch<TrackDetail>(`/api/tracks/${props.track.id}/lyrics`, {
      method: 'PUT',
      body: { text: draft.value },
    })
    editing.value = false
    emit('changed', detail)
  }
  catch (error) {
    actionError.value = describeError(error, t)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="rounded-[8px] bg-surface p-4 sm:p-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
        {{ t('lyricsPanel.heading') }}
      </h2>

      <!-- Where this Track's Lyrics come from. Providers this Akapela has no
           token for are not here at all. -->
      <div
        class="flex items-center gap-1 rounded-pill bg-surface-mid p-1"
        role="group"
        :aria-label="t('lyricsPanel.providerLabel')"
      >
        <button
          v-for="provider in lyricsProviders"
          :key="provider"
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-xs font-bold uppercase tracking-[1.4px] transition disabled:opacity-60"
          :class="provider === track.lyricsProvider
            ? 'bg-text text-ground'
            : 'text-text-muted hover:text-text'"
          :aria-pressed="provider === track.lyricsProvider"
          :disabled="busy"
          @click="pick(provider)"
        >
          <Loader2
            v-if="fetching === provider"
            class="size-3.5 animate-spin"
          />
          {{ providerName(provider) }}
        </button>
      </div>
    </div>

    <div
      v-if="!editing"
      class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <div class="min-w-0 sm:flex-1">
        <p
          v-if="summary"
          class="truncate text-sm font-bold"
        >
          {{ summary }}
        </p>
        <p
          v-else
          class="text-sm"
          :class="track.lyricsError ? 'text-negative' : 'text-text-muted'"
        >
          {{ emptyReason }}
        </p>
        <button
          v-if="canSetDefault"
          type="button"
          class="mt-1 inline-flex h-8 items-center rounded-pill text-xs font-bold text-text-muted transition hover:text-text disabled:opacity-60"
          :disabled="savingDefault"
          @click="setDefaultLyricsProvider(track.lyricsProvider)"
        >
          {{ t('lyricsPanel.useForNew', { provider: providerName(track.lyricsProvider) }) }}
        </button>
      </div>

      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <button
          v-if="hasSong && track.lyricsProvider !== 'manual'"
          type="button"
          class="inline-flex h-11 items-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
          :disabled="busy"
          @click="fetchFrom(track.lyricsProvider)"
        >
          <Loader2
            v-if="busy"
            class="size-4 animate-spin"
          />
          <RefreshCw
            v-else
            class="size-4"
          />
          {{ t('lyricsPanel.fetchAgain') }}
        </button>
        <button
          type="button"
          class="inline-flex h-11 items-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
          @click="startEditing"
        >
          <Pencil
            v-if="lyrics"
            class="size-4"
          />
          <ClipboardPaste
            v-else
            class="size-4"
          />
          {{ lyrics ? t('lyricsPanel.edit') : t('lyricsPanel.paste') }}
        </button>
      </div>
    </div>

    <!-- Typing or pasting the words. Whatever comes out of here is Manual. -->
    <form
      v-else
      class="mt-3"
      @submit.prevent="saveTyped"
    >
      <label
        class="text-sm text-text-muted"
        for="lyrics-text"
      >
        {{ t('lyricsPanel.editHint') }}
      </label>
      <textarea
        id="lyrics-text"
        v-model="draft"
        rows="12"
        class="mt-2 w-full rounded-[6px] bg-surface-mid p-3 font-mono text-sm leading-relaxed text-text placeholder:text-text-muted focus:outline-none focus:shadow-[var(--shadow-inset-border)]"
        :maxlength="MANUAL_LYRICS_MAX_LENGTH"
        :placeholder="t('lyricsPanel.placeholder')"
        spellcheck="false"
      />
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          class="inline-flex h-11 items-center gap-2 rounded-pill bg-accent px-6 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110 disabled:opacity-60"
          :disabled="busy || !draft.trim()"
        >
          <Loader2
            v-if="busy"
            class="size-4 animate-spin"
          />
          {{ t('lyricsPanel.save') }}
        </button>
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-pill px-4 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
          @click="editing = false"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </form>

    <ErrorMessage
      class="mt-3"
      :error="actionError"
    />

    <ConfirmDialog
      :open="pendingFetch !== null"
      :title="t('lyricsPanel.replaceTitle')"
      :message="t('lyricsPanel.replaceMessage', { provider: pendingFetch ? providerName(pendingFetch) : '' })"
      :confirm-label="t('songPanel.replace')"
      :busy="busy"
      @confirm="pendingFetch && fetchFrom(pendingFetch, true)"
      @cancel="pendingFetch = null"
    />
  </section>
</template>
