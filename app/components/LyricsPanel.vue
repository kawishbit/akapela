<script setup lang="ts">
import { ClipboardPaste, Loader2, Pencil, RefreshCw } from 'lucide-vue-next'
import type { TrackDetail } from '~~/server/lib/tracks'
import {
  LYRICS_PROVIDER_LABELS,
  MANUAL_LYRICS_MAX_LENGTH,
  lyricsText,
  type LyricsProviderName,
} from '~~/shared/lyrics'

const props = defineProps<{ track: TrackDetail }>()
const emit = defineEmits<{ changed: [track: TrackDetail] }>()

const { lyricsProviders, defaultLyricsProvider, setDefaultLyricsProvider, saving: savingDefault }
  = useSettings()

const busy = ref(false)
/** The provider being fetched from right now, so its button is the one that spins. */
const fetching = ref<LyricsProviderName | null>(null)
const actionError = ref<string | null>(null)

/** The fetch the singer is being asked about, held until they answer the dialog. */
const pendingFetch = ref<LyricsProviderName | null>(null)

const editing = ref(false)
const draft = ref('')

const lyrics = computed(() => props.track.lyrics)
const hasSong = computed(() => Boolean(props.track.songTitle))

const summary = computed(() => {
  if (!lyrics.value) return null
  const kind = lyrics.value.kind === 'synced' ? 'Synced' : 'Plain'
  const count = lyrics.value.lines.length
  return `${kind} Lyrics from ${LYRICS_PROVIDER_LABELS[lyrics.value.provider]} · ${count} line${count === 1 ? '' : 's'}`
})

/** Why there are no Lyrics yet, in the words that say what to do about it. */
const emptyReason = computed(() => {
  if (props.track.lyricsError) return props.track.lyricsError
  if (!hasSong.value) return 'Confirm which Song this Track is, or paste the Lyrics yourself.'
  if (props.track.lyricsProvider === 'manual') return 'These Lyrics are yours to type. Paste them below.'
  return `No Lyrics for this Song on ${LYRICS_PROVIDER_LABELS[props.track.lyricsProvider]}.`
    + ' Try another provider, or paste them yourself.'
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
    else actionError.value = describeError(error)
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
    actionError.value = describeError(error)
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
        Lyrics
      </h2>

      <!-- Where this Track's Lyrics come from. Providers this Akapela has no
           token for are not here at all. -->
      <div
        class="flex items-center gap-1 rounded-pill bg-surface-mid p-1"
        role="group"
        aria-label="Lyrics Provider"
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
          {{ LYRICS_PROVIDER_LABELS[provider] }}
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
          Use {{ LYRICS_PROVIDER_LABELS[track.lyricsProvider] }} for new Tracks
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
          Fetch again
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
          {{ lyrics ? 'Edit Lyrics' : 'Paste Lyrics' }}
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
        One line per line sung. Saving makes these Lyrics yours, so fetching again will ask first.
      </label>
      <textarea
        id="lyrics-text"
        v-model="draft"
        rows="12"
        class="mt-2 w-full rounded-[6px] bg-surface-mid p-3 font-mono text-sm leading-relaxed text-text placeholder:text-text-muted focus:outline-none focus:shadow-[var(--shadow-inset-border)]"
        :maxlength="MANUAL_LYRICS_MAX_LENGTH"
        placeholder="Yesterday&#10;All my troubles seemed so far away"
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
          Save Lyrics
        </button>
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-pill px-4 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
          @click="editing = false"
        >
          Cancel
        </button>
      </div>
    </form>

    <p
      v-if="actionError"
      class="mt-3 text-sm text-negative"
      role="alert"
    >
      {{ actionError }}
    </p>

    <ConfirmDialog
      :open="pendingFetch !== null"
      title="Replace the Lyrics you typed?"
      :message="`Fetching from ${pendingFetch ? LYRICS_PROVIDER_LABELS[pendingFetch] : ''} replaces the Lyrics on this Track with the ones it has.`"
      confirm-label="Replace"
      :busy="busy"
      @confirm="pendingFetch && fetchFrom(pendingFetch, true)"
      @cancel="pendingFetch = null"
    />
  </section>
</template>
