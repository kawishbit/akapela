<script setup lang="ts">
import { ChevronDown, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-vue-next'
import { effectivePitchSemitones } from '~~/shared/adjustments'
import { VOLUME_MAX, VOLUME_MIN } from '~/audio/volume'
import type { ErrorText } from '~/utils/errors'

// The Lyrics fill the screen here; the persistent player bar would only steal
// room from them, so this page carries its own transport.
// Nothing interrupts a Take: an Update waits until the singer leaves this page.
definePageMeta({ playerBar: false, updatePrompt: false })

const SAVE_DEBOUNCE_MS = 400

const { t, locale } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.id))
const player = usePlayer()
// The page fills the viewport in a browser tab. Under Akapela's own title bar
// — the Desktop App, or the installed PWA — it fills only the space below the
// bar instead (`app.vue` makes that space its positioning box): the bar is a
// row of the page rather than something floating over it, so pinned to the
// whole window this header would sit under the bar.
const { shown: hasTitleBar } = useTitleBar()
const playerState = player.state

const { track, notFound, refresh } = useTrackDetail(id)

const recorder = useTakeRecorder(id)
onBeforeUnmount(() => recorder.destroy())

// Sung from the Queue (`?entry=`): the singer's name shows beside the title,
// and the entry is used up when this visit ends. Either way, how the visit
// ended is what decides where Up next is offered.
const entryId = computed(() => (typeof route.query.entry === 'string' ? route.query.entry : null))
const turn = useQueueTurn(id, entryId)
let recordedATake = false
onBeforeUnmount(() => turn.end(recordedATake))
// A saved Take lands on its Review screen (ticket 08) rather than staying here.
// The Take page reads the Track through the same cached `track-<id>` entry
// this page does — refreshing it first (rather than letting the Take page's
// own `useTrackDetail` reuse whatever this page already fetched, which is
// from before this Take existed) is what keeps a fast redirect from landing
// on a "Take not found" screen for a Take that has, in fact, been saved.
watch(() => recorder.state.value.savedTake, async (take) => {
  if (!take) return
  recordedATake = true
  await refresh()
  navigateTo(`/tracks/${id.value}/takes/${take.id}`)
})
/** The regular transport drives the same play/pause the recorder does; hide it while that is in the recorder's hands. */
const transportAvailable = computed(() =>
  recorder.state.value.phase !== 'counting-down' && recorder.state.value.phase !== 'recording')

onMounted(() => {
  watch(track, (value) => {
    if (value?.importState === 'ready') player.open(value)
  }, { immediate: true })
})

const isCurrent = computed(() => playerState.value.track?.id === id.value)
const positionMs = computed(() => (isCurrent.value ? playerState.value.positionMs : 0))
const durationMs = computed(() => track.value?.durationMs ?? playerState.value.durationMs)
const adjustments = computed(() => (isCurrent.value ? playerState.value.adjustments : track.value?.adjustments) ?? null)

/**
 * Which of the Track's audio files is playing. The player's own while it holds
 * this Track, because a switch is a reload and until it lands the singer is
 * still hearing the other one.
 */
const backingSource = computed(() =>
  isCurrent.value ? playerState.value.backingSource : track.value?.backingSource)

// The confirmed Song reads better than a video title, but a name the singer
// typed themselves is the one they chose to see.
const songLabel = computed(() => {
  const current = track.value
  if (!current) return ''
  if (current.titleEdited || current.artistEdited) {
    return current.artist ? `${current.artist} · ${current.title}` : current.title
  }
  return current.songTitle ? `${current.songArtist} · ${current.songTitle}` : current.title
})

/** Where the words on screen came from, so a singer knows what to change if they are wrong. */
const lyricsLabel = computed(() => {
  const lyrics = track.value?.lyrics
  if (!lyrics) return null
  const provider = t(`lyricsProviders.${lyrics.provider}`)
  return lyrics.kind === 'synced' ? t('sing.lyricsSynced', { provider }) : t('sing.lyricsPlain', { provider })
})

// The Lyrics Offset moves under the singer's thumb and is saved once the
// nudging stops, so a run of taps is one request.
const offsetMs = ref(0)
watch(track, value => (offsetMs.value = value?.lyricsOffsetMs ?? 0), { immediate: true })

const saveError = ref<ErrorText | null>(null)
let pendingSave: { timer: ReturnType<typeof setTimeout>, run: () => void } | undefined

function setOffset(next: number) {
  offsetMs.value = next
  if (pendingSave) clearTimeout(pendingSave.timer)
  const run = () => {
    pendingSave = undefined
    $fetch(`/api/tracks/${id.value}/lyrics-offset`, {
      method: 'PUT',
      body: { offsetMs: next },
      keepalive: true,
    })
      .then(() => {
        if (track.value) track.value.lyricsOffsetMs = next
        saveError.value = null
      })
      .catch((error) => {
        saveError.value = describeError(error, t)
      })
  }
  pendingSave = { timer: setTimeout(run, SAVE_DEBOUNCE_MS), run }
}

/** A nudge made just before leaving still counts, the way Adjustments do. */
function flushSave() {
  if (!pendingSave) return
  clearTimeout(pendingSave.timer)
  pendingSave.run()
}

onMounted(() => window.addEventListener('pagehide', flushSave))
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', flushSave)
  flushSave()
})

/** Position shown while the thumb is being dragged, before the seek is committed. */
const scrubbing = ref<number | null>(null)
const shownMs = computed(() => scrubbing.value ?? positionMs.value)

function onScrub(event: Event) {
  scrubbing.value = Number((event.target as HTMLInputElement).value)
}

function onSeek(event: Event) {
  scrubbing.value = null
  player.seek(Number((event.target as HTMLInputElement).value))
}

function onVolumeInput(event: Event) {
  player.setVolume(Number((event.target as HTMLInputElement).value))
}

useHead(() => ({ title: track.value ? t('app.pageTitle', { page: t('sing.pageTitle', { title: track.value.title }) }) : 'Akapela' }))
</script>

<template>
  <main
    class="inset-0 flex flex-col overflow-hidden bg-ground"
    :class="hasTitleBar ? 'absolute' : 'fixed'"
  >
    <!-- The cover art is the only colour on the page (DESIGN.md §1). -->
    <div
      v-if="track"
      class="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      <img
        :src="`/api/tracks/${track.id}/cover?v=${track.updatedAt}`"
        alt=""
        class="size-full scale-125 object-cover opacity-40 blur-3xl"
      >
      <div class="absolute inset-0 bg-gradient-to-b from-ground/60 via-ground/75 to-ground" />
    </div>

    <header class="relative z-10 flex items-center gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
      <NuxtLink
        :to="`/tracks/${id}`"
        class="flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
        :aria-label="t('sing.back')"
      >
        <ChevronDown class="size-6" />
      </NuxtLink>
      <div class="min-w-0 flex-1 text-center">
        <p class="truncate text-sm font-bold text-text">
          {{ songLabel }}<span
            v-if="turn.entry.value?.singerName"
            class="font-normal text-text-muted"
          > · {{ turn.entry.value.singerName }}</span>
        </p>
        <p
          v-if="adjustments"
          class="truncate text-xs text-text-muted"
        >
          {{ formatPitch(effectivePitchSemitones(adjustments), locale) }} · {{ formatTempo(adjustments.tempoPercent) }}
          <template v-if="backingSource"> · {{ t(`backingSources.${backingSource}`) }}</template>
          <template v-if="lyricsLabel"> · {{ lyricsLabel }}</template>
        </p>
      </div>
      <div class="size-11 shrink-0" />
    </header>

    <div class="relative z-10 min-h-0 flex-1">
      <LyricsView
        v-if="track?.lyrics"
        :kind="track.lyrics.kind"
        :lines="track.lyrics.lines"
        :position-ms="positionMs"
        :duration-ms="durationMs"
        :offset-ms="offsetMs"
        @seek="player.seek($event)"
      />
      <div
        v-else
        class="flex h-full flex-col items-center justify-center px-6 text-center"
      >
        <h1 class="text-lg font-semibold">
          {{ notFound ? t('track.notFound') : t('sing.noLyrics') }}
        </h1>
        <p class="mt-2 max-w-sm text-sm text-text-muted">
          <template v-if="notFound">
            {{ t('track.notFoundBody') }}
          </template>
          <template v-else-if="track?.songTitle">
            {{ t('sing.noWords', {
              provider: t(`lyricsProviders.${track.lyricsProvider}`),
              song: `${track.songArtist} · ${track.songTitle}`,
            }) }}
          </template>
          <template v-else>
            {{ t('sing.noSong') }}
          </template>
        </p>
        <NuxtLink
          :to="`/tracks/${id}`"
          class="mt-6 inline-flex h-12 items-center rounded-pill bg-surface-mid px-6 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
        >
          {{ t('sing.openTrack') }}
        </NuxtLink>
      </div>
    </div>

    <footer
      class="relative z-10 flex flex-col items-center gap-3 px-4 pt-3 sm:px-6"
      style="padding-bottom: calc(max(0.5rem, env(safe-area-inset-bottom)) + 1.5rem)"
    >
      <ErrorMessage
        v-if="saveError"
        class="text-xs"
        :error="{ message: t('sing.offsetNotSaved', { reason: saveError.message }), details: saveError.details }"
      />

      <LyricsOffsetControl
        v-if="track?.lyrics && transportAvailable"
        :offset-ms="offsetMs"
        @change="setOffset"
      />

      <div
        v-if="track?.importState === 'ready' && transportAvailable"
        class="flex w-full max-w-3xl items-center gap-3"
      >
        <span class="w-12 text-right text-xs tabular-nums text-text-muted">{{ formatDuration(shownMs) }}</span>
        <input
          type="range"
          class="h-11 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-default"
          min="0"
          :max="Math.max(durationMs, 1)"
          step="100"
          :value="shownMs"
          :disabled="!isCurrent || playerState.loading || playerState.error !== null"
          :aria-label="t('audioPlayer.seek')"
          @input="onScrub"
          @change="onSeek"
        >
        <span class="w-12 text-xs tabular-nums text-text-muted">-{{ formatDuration(Math.max(0, durationMs - shownMs)) }}</span>
        <button
          type="button"
          class="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:brightness-110 disabled:bg-surface-mid disabled:text-text-muted"
          :disabled="!isCurrent || playerState.error !== null"
          :aria-label="playerState.playing ? t('common.pause') : t('common.play')"
          @click="player.toggle()"
        >
          <Loader2
            v-if="playerState.loading"
            class="size-6 animate-spin"
          />
          <Pause
            v-else-if="playerState.playing"
            class="size-6"
            fill="currentColor"
          />
          <Play
            v-else
            class="size-6 translate-x-px"
            fill="currentColor"
          />
        </button>
      </div>

      <div
        v-if="track?.importState === 'ready' && transportAvailable"
        class="flex w-full max-w-3xl items-center gap-3"
      >
        <VolumeX
          v-if="playerState.volume <= VOLUME_MIN"
          class="size-4 shrink-0 text-text-muted"
          aria-hidden="true"
        />
        <Volume2
          v-else
          class="size-4 shrink-0 text-text-muted"
          aria-hidden="true"
        />
        <input
          type="range"
          class="h-11 w-full max-w-40 cursor-pointer accent-accent"
          :min="VOLUME_MIN"
          :max="VOLUME_MAX"
          step="0.01"
          :value="playerState.volume"
          :aria-label="t('playerBar.volume')"
          :aria-valuetext="formatGain(playerState.volume)"
          @input="onVolumeInput"
        >
      </div>

      <ErrorMessage
        v-if="isCurrent"
        :error="playerState.error"
      />

      <RecordControl
        v-if="track?.importState === 'ready'"
        :recorder="recorder"
      />
    </footer>
  </main>
</template>
