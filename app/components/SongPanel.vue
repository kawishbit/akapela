<script setup lang="ts">
import { Check, Loader2, Search } from 'lucide-vue-next'
import type { SongSearch } from '~~/server/lib/songs'
import type { SongMatch } from '~~/server/lyrics/provider'
import type { TrackDetail } from '~~/server/lib/tracks'
import { SONG_FIELD_MAX_LENGTH } from '~~/shared/song'
import type { ErrorText } from '~/utils/errors'

const props = defineProps<{ track: TrackDetail }>()
const emit = defineEmits<{ confirmed: [track: TrackDetail] }>()

const { t } = useI18n()

const choosing = ref(false)
const artist = ref('')
const title = ref('')

const search = ref<SongSearch | null>(null)
const searching = ref(false)
const searchError = ref<ErrorText | null>(null)

const confirmingKey = ref<string | null>(null)
const confirmError = ref<ErrorText | null>(null)
/** The other Track that already has the Song just refused, which the refusal links to. */
const inLibrary = ref<{ id: string, title: string } | null>(null)

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
    searchError.value = describeError(error, t)
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
  inLibrary.value = null
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
    const refusal = (error as { data?: { data?: { code?: unknown, track?: { id: string, title: string } } } }).data?.data
    // Confirming a Song fetches its Lyrics, which would replace ones the
    // singer typed; the server refuses until they have been asked.
    if (refusal?.code === 'manualLyricsOverwrite') {
      pendingConfirm.value = { song, key }
    }
    else {
      confirmError.value = describeError(error, t)
      // No two Tracks share a Song: say which one has it, and link to it.
      inLibrary.value = refusal?.code === 'songInLibrary' && refusal.track ? refusal.track : null
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
      {{ t('songPanel.heading') }}
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
          {{ t('songPanel.lookedUpOn', { provider: t(`lyricsProviders.${track.lyricsProvider}`) }) }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
          @click="openChooser"
        >
          {{ t('songPanel.change') }}
        </button>
      </div>
    </div>

    <!-- Picking one, either from what the provider knows or by hand. -->
    <div v-else>
      <p class="mt-1 text-sm text-text-muted">
        {{ t('songPanel.intro') }}
      </p>

      <form
        class="mt-3 flex flex-col gap-2 sm:flex-row"
        @submit.prevent="runSearch(true)"
      >
        <input
          v-model="artist"
          type="text"
          class="h-11 min-w-0 flex-1 rounded-pill bg-surface-mid px-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:shadow-[var(--shadow-inset-border)]"
          :placeholder="t('songPanel.artist')"
          :aria-label="t('songPanel.artist')"
          :maxlength="SONG_FIELD_MAX_LENGTH"
        >
        <input
          v-model="title"
          type="text"
          class="h-11 min-w-0 flex-1 rounded-pill bg-surface-mid px-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:shadow-[var(--shadow-inset-border)]"
          :placeholder="t('songPanel.title')"
          :aria-label="t('songPanel.title')"
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
          {{ t('songPanel.search') }}
        </button>
      </form>

      <ErrorMessage
        class="mt-3"
        :error="searchError"
      />

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
                {{ match.album ?? t('songPanel.unknownAlbum') }}
                <template v-if="match.durationMs"> · {{ formatDuration(match.durationMs) }}</template>
                <template v-if="match.instrumental"> · {{ t('songPanel.instrumental') }}</template>
              </span>
            </span>
          </button>
        </li>
      </ul>

      <p
        v-else-if="search && !searching"
        class="mt-3 text-sm text-text-muted"
      >
        {{ t('songPanel.noMatches', { artist: search.artist || t('songPanel.thatArtist'), title: search.title }) }}
      </p>

      <p
        v-if="title.trim() && !artist.trim()"
        class="mt-3 text-sm text-text-muted"
      >
        {{ t('songPanel.addArtist') }}
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
          {{ canConfirmTyped ? t('songPanel.useTyped', { song: typedSongLabel }) : t('songPanel.useWhatITyped') }}
        </button>
        <button
          v-if="confirmedSong"
          type="button"
          class="inline-flex h-11 items-center rounded-pill px-4 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
          @click="choosing = false"
        >
          {{ t('common.cancel') }}
        </button>
      </div>

      <ErrorMessage
        class="mt-3"
        :error="confirmError"
      />
      <NuxtLink
        v-if="inLibrary"
        :to="`/tracks/${inLibrary.id}`"
        class="mt-2 inline-flex h-11 items-center rounded-pill bg-surface-mid px-5 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
      >
        {{ t('songPanel.openOther', { title: inLibrary.title }) }}
      </NuxtLink>
    </div>

    <ConfirmDialog
      :open="pendingConfirm !== null"
      :title="t('songPanel.replaceTitle')"
      :message="t('songPanel.replaceMessage')"
      :confirm-label="t('songPanel.replace')"
      :busy="confirmingKey !== null"
      @confirm="pendingConfirm && confirm(pendingConfirm.song, pendingConfirm.key, true)"
      @cancel="pendingConfirm = null"
    />
  </section>
</template>
