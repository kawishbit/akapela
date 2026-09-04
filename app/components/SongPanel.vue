<script setup lang="ts">
import { Check, Loader2, Search } from 'lucide-vue-next'
import type { SongSearch } from '~~/server/lib/songs'
import type { SongMatch } from '~~/server/lyrics/provider'
import type { TrackDetail } from '~~/server/lib/tracks'
import { LYRICS_PROVIDER_LABELS } from '~~/shared/lyrics'
import { SONG_FIELD_MAX_LENGTH } from '~~/shared/song'

const props = defineProps<{ track: TrackDetail }>()
const emit = defineEmits<{ confirmed: [track: TrackDetail] }>()

const choosing = ref(false)
const artist = ref('')
const title = ref('')

const search = ref<SongSearch | null>(null)
const searching = ref(false)
const searchError = ref<string | null>(null)

const confirmingKey = ref<string | null>(null)
const confirmError = ref<string | null>(null)

/** The Song the singer is being asked about, held until they answer the dialog. */
const pendingConfirm = ref<{ song: { artist: string, title: string } & Partial<SongMatch>, key: string } | null>(null)

const confirmedSong = computed(() =>
  props.track.songTitle ? { artist: props.track.songArtist ?? '', title: props.track.songTitle } : null)

const typedSongLabel = computed(() => `${artist.value.trim()} · ${title.value.trim()}`)
const canConfirmTyped = computed(() => artist.value.trim().length > 0 && title.value.trim().length > 0)

/** A Track with no Song is what the singer came here to fix, so the search runs unasked. */
watch(() => [props.track.id, props.track.importState] as const, ([, state]) => {
  if (state === 'ready' && !props.track.songTitle) openChooser()
}, { immediate: true })

async function openChooser() {
  choosing.value = true
  if (!search.value) await runSearch()
}

/** Searches for what the singer typed, or for the guess read from the Track title when they have typed nothing. */
async function runSearch(useTyped = false) {
  searching.value = true
  searchError.value = null
  try {
    const query = useTyped ? { artist: artist.value.trim(), title: title.value.trim() } : {}
    const found = await $fetch<SongSearch>(`/api/tracks/${props.track.id}/songs`, { query })
    search.value = found
    if (!useTyped) {
      artist.value = found.artist
      title.value = found.title
    }
  }
  catch (error) {
    searchError.value = describeError(error)
  }
  finally {
    searching.value = false
  }
}

async function confirm(
  song: { artist: string, title: string } & Partial<SongMatch>,
  key: string,
  overwriteManual = false,
) {
  confirmingKey.value = key
  confirmError.value = null
  try {
    const detail = await $fetch<TrackDetail>(`/api/tracks/${props.track.id}/song`, {
      method: 'PUT',
      body: {
        artist: song.artist,
        title: song.title,
        providerIds: song.providerIds,
        albumArtUrl: song.albumArtUrl,
        overwriteManual,
      },
    })
    emit('confirmed', detail)
    pendingConfirm.value = null
    choosing.value = false
    search.value = null
  }
  catch (error) {
    // Confirming a Song fetches its Lyrics, which would replace ones the
    // singer typed; the server refuses until they have been asked.
    if ((error as { statusCode?: number }).statusCode === 409) {
      pendingConfirm.value = { song, key }
    }
    else {
      confirmError.value = describeError(error)
    }
  }
  finally {
    confirmingKey.value = null
  }
}

function matchKey(match: SongMatch, index: number) {
  return search.value ? match.providerIds[search.value.provider] ?? `${index}` : `${index}`
}
</script>

<template>
  <section class="rounded-[8px] bg-surface p-4 sm:p-5">
    <h2 class="text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
      Song
    </h2>

    <!-- What the Track is, once the singer has said so. -->
    <div
      v-if="confirmedSong && !choosing"
      class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <div class="min-w-0 sm:flex-1">
        <p class="truncate text-base font-bold">
          {{ confirmedSong.artist }} · {{ confirmedSong.title }}
        </p>
        <p class="mt-0.5 truncate text-sm text-text-muted">
          Looked up on {{ LYRICS_PROVIDER_LABELS[track.lyricsProvider] }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
          @click="openChooser"
        >
          Change Song
        </button>
      </div>
    </div>

    <!-- Picking one, either from what the provider knows or by hand. -->
    <div v-else>
      <p class="mt-1 text-sm text-text-muted">
        Confirm which Song this Track is and Presto fetches its Lyrics.
      </p>

      <form
        class="mt-3 flex flex-col gap-2 sm:flex-row"
        @submit.prevent="runSearch(true)"
      >
        <input
          v-model="artist"
          type="text"
          class="h-11 min-w-0 flex-1 rounded-pill bg-surface-mid px-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:shadow-[var(--shadow-inset-border)]"
          placeholder="Artist"
          aria-label="Artist"
          :maxlength="SONG_FIELD_MAX_LENGTH"
        >
        <input
          v-model="title"
          type="text"
          class="h-11 min-w-0 flex-1 rounded-pill bg-surface-mid px-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:shadow-[var(--shadow-inset-border)]"
          placeholder="Title"
          aria-label="Title"
          :maxlength="SONG_FIELD_MAX_LENGTH"
        >
        <button
          type="submit"
          class="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
          :disabled="searching || !title.trim()"
        >
          <Loader2
            v-if="searching"
            class="size-4 animate-spin"
          />
          <Search
            v-else
            class="size-4"
          />
          Search
        </button>
      </form>

      <p
        v-if="searchError"
        class="mt-3 text-sm text-negative"
        role="alert"
      >
        {{ searchError }}
      </p>

      <ul
        v-if="search?.matches.length"
        class="mt-3 flex flex-col gap-1"
      >
        <li
          v-for="(match, index) in search.matches"
          :key="matchKey(match, index)"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-[6px] px-3 py-2 text-left transition hover:bg-surface-mid disabled:opacity-60"
            :disabled="confirmingKey !== null"
            @click="confirm(match, matchKey(match, index))"
          >
            <Loader2
              v-if="confirmingKey === matchKey(match, index)"
              class="size-4 shrink-0 animate-spin text-accent"
            />
            <Check
              v-else
              class="size-4 shrink-0 text-text-muted"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-bold">{{ match.artist }} · {{ match.title }}</span>
              <span class="block truncate text-xs text-text-muted">
                {{ match.album ?? 'Unknown album' }}
                <template v-if="match.durationMs"> · {{ formatDuration(match.durationMs) }}</template>
                <template v-if="match.instrumental"> · instrumental</template>
              </span>
            </span>
          </button>
        </li>
      </ul>

      <p
        v-else-if="search && !searching"
        class="mt-3 text-sm text-text-muted"
      >
        No matches for {{ search.artist || 'that artist' }} · {{ search.title }}. Edit the artist and title, or
        confirm what you typed anyway.
      </p>

      <p
        v-if="title.trim() && !artist.trim()"
        class="mt-3 text-sm text-text-muted"
      >
        Add the artist too: Lyrics are looked up by artist and title.
      </p>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex h-11 items-center gap-2 rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
          :disabled="!canConfirmTyped || confirmingKey !== null"
          @click="confirm({ artist: artist.trim(), title: title.trim() }, 'typed')"
        >
          <Loader2
            v-if="confirmingKey === 'typed'"
            class="size-4 animate-spin"
          />
          Use {{ canConfirmTyped ? typedSongLabel : 'what I typed' }}
        </button>
        <button
          v-if="confirmedSong"
          type="button"
          class="inline-flex h-11 items-center rounded-pill px-4 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
          @click="choosing = false"
        >
          Cancel
        </button>
      </div>

      <p
        v-if="confirmError"
        class="mt-3 text-sm text-negative"
        role="alert"
      >
        {{ confirmError }}
      </p>
    </div>

    <ConfirmDialog
      :open="pendingConfirm !== null"
      title="Replace the Lyrics you typed?"
      message="Confirming a Song fetches its Lyrics, which replaces the ones typed on this Track."
      confirm-label="Replace"
      :busy="confirmingKey !== null"
      @confirm="pendingConfirm && confirm(pendingConfirm.song, pendingConfirm.key, true)"
      @cancel="pendingConfirm = null"
    />
  </section>
</template>
