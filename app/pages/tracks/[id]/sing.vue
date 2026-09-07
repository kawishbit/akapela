<script setup lang="ts">
import { ChevronDown, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-vue-next'
import { effectivePitchSemitones } from '~~/shared/adjustments'
import { BACKING_SOURCE_LABELS } from '~~/shared/backing-source'
import { LYRICS_PROVIDER_LABELS } from '~~/shared/lyrics'
import { VOLUME_MAX, VOLUME_MIN } from '~/audio/volume'

// The Lyrics fill the screen here; the persistent player bar would only steal
// room from them, so this page carries its own transport.
definePageMeta({ playerBar: false })

const SAVE_DEBOUNCE_MS = 400

const route = useRoute()
const id = computed(() => String(route.params.id))
const player = usePlayer()
const playerState = player.state

const { track, notFound } = useTrackDetail(id)

const recorder = useTakeRecorder(id)
onBeforeUnmount(() => recorder.destroy())
// A saved Take lands on its Review screen (ticket 08) rather than staying here.
watch(() => recorder.state.value.savedTake, (take) => {
  if (take) navigateTo(`/tracks/${id.value}/takes/${take.id}`)
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

const songLabel = computed(() => {
  const current = track.value
  if (!current) return ''
  return current.songTitle ? `${current.songArtist} · ${current.songTitle}` : current.title
})

/** Where the words on screen came from, so a singer knows what to change if they are wrong. */
const lyricsLabel = computed(() => {
  const lyrics = track.value?.lyrics
  if (!lyrics) return null
  return `${lyrics.kind === 'synced' ? 'Synced' : 'Plain'} Lyrics from ${LYRICS_PROVIDER_LABELS[lyrics.provider]}`
})

// The Lyrics Offset moves under the singer's thumb and is saved once the
// nudging stops, so a run of taps is one request.
const offsetMs = ref(0)
watch(track, value => (offsetMs.value = value?.lyricsOffsetMs ?? 0), { immediate: true })

const saveError = ref<string | null>(null)
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
        saveError.value = describeError(error)
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

useHead(() => ({ title: track.value ? `Sing ${track.value.title} · Akapela` : 'Akapela' }))
</script>

<template>
  <main class="fixed inset-0 flex flex-col overflow-hidden bg-ground">
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

    <header class="relative z-10 flex items-center gap-3 px-4 pt-3 sm:px-6 sm:pt-4">
      <NuxtLink
        :to="`/tracks/${id}`"
        class="flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
        aria-label="Back to the Track"
      >
        <ChevronDown class="size-6" />
      </NuxtLink>
      <div class="min-w-0 flex-1 text-center">
        <p class="truncate text-sm font-bold text-text">
          {{ songLabel }}
        </p>
        <p
          v-if="adjustments"
          class="truncate text-xs text-text-muted"
        >
          {{ formatPitch(effectivePitchSemitones(adjustments)) }} · {{ formatTempo(adjustments.tempoPercent) }}
          <template v-if="backingSource"> · {{ BACKING_SOURCE_LABELS[backingSource] }}</template>
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
          {{ notFound ? 'Track not found' : 'No Lyrics yet' }}
        </h1>
        <p class="mt-2 max-w-sm text-sm text-text-muted">
          <template v-if="notFound">
            It may have been deleted.
          </template>
          <template v-else-if="track?.songTitle">
            {{ LYRICS_PROVIDER_LABELS[track.lyricsProvider] }} has no words for
            {{ track.songArtist }} · {{ track.songTitle }}. Open the Track to try another provider or
            paste them yourself.
          </template>
          <template v-else>
            Confirm which Song this Track is and Akapela will fetch its Lyrics.
          </template>
        </p>
        <NuxtLink
          :to="`/tracks/${id}`"
          class="mt-6 inline-flex h-12 items-center rounded-pill bg-surface-mid px-6 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
        >
          Open the Track
        </NuxtLink>
      </div>
    </div>

    <footer
      class="relative z-10 flex flex-col items-center gap-3 px-4 pb-4 pt-2 sm:px-6"
      style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
    >
      <p
        v-if="saveError"
        class="text-xs text-negative"
        role="alert"
      >
        The Lyrics Offset could not be saved: {{ saveError }}
      </p>

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
          aria-label="Seek"
          @input="onScrub"
          @change="onSeek"
        >
        <span class="w-12 text-xs tabular-nums text-text-muted">-{{ formatDuration(Math.max(0, durationMs - shownMs)) }}</span>
        <button
          type="button"
          class="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-ground transition hover:brightness-110 disabled:bg-surface-mid disabled:text-text-muted"
          :disabled="!isCurrent || playerState.error !== null"
          :aria-label="playerState.playing ? 'Pause' : 'Play'"
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
          aria-label="Backing Track volume"
          :aria-valuetext="formatGain(playerState.volume)"
          @input="onVolumeInput"
        >
      </div>

      <p
        v-if="isCurrent && playerState.error"
        class="text-sm text-negative"
        role="alert"
      >
        {{ playerState.error }}
      </p>

      <RecordControl
        v-if="track?.importState === 'ready'"
        :recorder="recorder"
      />
    </footer>
  </main>
</template>
