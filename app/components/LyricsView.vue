<script setup lang="ts">
import { currentLineIndex, plainScrollFraction, type LyricsKind, type LyricsLine } from '~~/shared/lyrics'

const props = defineProps<{
  kind: LyricsKind
  lines: LyricsLine[]
  /** Song position in milliseconds. */
  positionMs: number
  durationMs: number
  offsetMs: number
}>()

const emit = defineEmits<{ seek: [positionMs: number] }>()

/** Long enough to read ahead a couple of lines, short enough not to feel abandoned. */
const MANUAL_SCROLL_PAUSE_MS = 4000

const scroller = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const lineEls = new Map<number, HTMLElement>()

/**
 * Half the visible height, so the first and last lines can sit in the middle
 * like every other one. Measured rather than a viewport unit because the
 * transport above and below this view changes how tall it is.
 */
const padBlockPx = ref(0)
const maxScroll = ref(0)

const currentIndex = computed(() => currentLineIndex({
  kind: props.kind,
  lines: props.lines,
  positionMs: props.positionMs,
  offsetMs: props.offsetMs,
  durationMs: props.durationMs,
}))

/** The song position at which a Synced line becomes the current one, offset included. */
function lineStartMs(line: LyricsLine): number | null {
  return line.atMs === undefined ? null : line.atMs + props.offsetMs
}

function setLineEl(index: number, el: Element | null) {
  if (el instanceof HTMLElement) lineEls.set(index, el)
  else lineEls.delete(index)
}

function measure() {
  const el = scroller.value
  if (!el) return
  padBlockPx.value = Math.max(0, Math.round(el.clientHeight / 2) - 40)
  // That padding only reaches the DOM on the next render, and near the ends of
  // the Lyrics it is most of what there is to scroll through, so the scrollable
  // height is worth measuring only once it is there.
  nextTick(() => {
    const scrolled = scroller.value
    if (scrolled) maxScroll.value = Math.max(0, scrolled.scrollHeight - scrolled.clientHeight)
  })
}

// Manual scrolling wins for a few seconds, so the singer can glance ahead
// without fighting the screen. A tap to seek is not a scroll and does not pause.
const paused = ref(false)
let resumeTimer: ReturnType<typeof setTimeout> | undefined

function pauseAutoScroll() {
  paused.value = true
  clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    paused.value = false
    follow(true)
  }, MANUAL_SCROLL_PAUSE_MS)
}

/**
 * Puts the Lyrics where the song is: Synced Lyrics centre the current line,
 * Plain Lyrics, having no timings of their own, scroll in proportion to how
 * much of the song has played.
 */
function follow(smooth = false) {
  const el = scroller.value
  if (!el || paused.value) return
  if (props.kind === 'plain') {
    el.scrollTop = plainScrollFraction(props.positionMs, props.offsetMs, props.durationMs) * maxScroll.value
    return
  }
  const line = lineEls.get(currentIndex.value)
  if (!line) return
  el.scrollTo({
    top: line.offsetTop - (el.clientHeight - line.offsetHeight) / 2,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

// Synced Lyrics move a line at a time; Plain Lyrics creep with the position.
watch(currentIndex, () => {
  if (props.kind === 'synced') follow(true)
})
watch(() => props.positionMs, () => {
  if (props.kind === 'plain') follow()
})
watch(() => [props.lines, props.kind], async () => {
  await nextTick()
  measure()
  follow()
})

let observer: ResizeObserver | undefined
onMounted(() => {
  measure()
  follow()
  observer = new ResizeObserver(measure)
  if (scroller.value) observer.observe(scroller.value)
  if (list.value) observer.observe(list.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(resumeTimer)
})
</script>

<template>
  <div
    ref="scroller"
    class="h-full overflow-y-auto overscroll-contain px-5 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden"
    tabindex="0"
    aria-label="Lyrics"
    @wheel="pauseAutoScroll"
    @touchmove="pauseAutoScroll"
    @keydown.up="pauseAutoScroll"
    @keydown.down="pauseAutoScroll"
    @keydown.page-up="pauseAutoScroll"
    @keydown.page-down="pauseAutoScroll"
  >
    <ol
      ref="list"
      class="mx-auto flex max-w-3xl flex-col gap-5 sm:gap-6"
      :style="{ paddingBlock: `${padBlockPx}px` }"
    >
      <li
        v-for="(line, index) in lines"
        :key="index"
        :ref="el => setLineEl(index, el as Element | null)"
      >
        <!--
          Every line keeps the same size and weight so the current one changing
          cannot reflow the column mid-song; brightness alone carries the
          emphasis, which is plenty on this near-black surface.

          These sizes run past DESIGN.md's compact 10-24px scale on wider
          screens, deliberately: that scale is for scanning an app's chrome,
          and here the Lyrics are the content, to be read at arm's length on a
          phone and across a desk on a laptop.
        -->
        <component
          :is="lineStartMs(line) === null ? 'p' : 'button'"
          :type="lineStartMs(line) === null ? undefined : 'button'"
          class="w-full text-left text-2xl font-bold leading-tight transition-colors duration-300 sm:text-3xl lg:text-4xl"
          :class="[
            index === currentIndex ? 'text-text' : 'text-text/30',
            lineStartMs(line) === null ? '' : 'cursor-pointer hover:text-text/60',
            line.text ? '' : 'h-3',
          ]"
          :aria-current="index === currentIndex ? 'true' : undefined"
          @click="lineStartMs(line) !== null && emit('seek', lineStartMs(line)!)"
        >
          {{ line.text }}
        </component>
      </li>
    </ol>
  </div>
</template>
