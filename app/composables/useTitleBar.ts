/**
 * Whether Akapela draws its own title bar, and in which of the two windows
 * that can happen.
 *
 * `desktop` is the Desktop App, whose shell asks for a frameless window
 * (`desktop/src/titlebar.ts`). `overlay` is the installed PWA with Window
 * Controls Overlay on (`display_override` in `nuxt.config.ts`): the browser
 * hands the page the title bar strip and keeps only its own
 * minimize/maximize/close — which a web page cannot remove — floating over one
 * end of it, at the edge `env(titlebar-area-*)` leaves clear. The singer can
 * turn the overlay off from that strip and back on, so it is tracked live.
 * Anywhere else — a browser tab, or a PWA without the overlay — it is `null`
 * and the browser keeps its own chrome.
 */
export function useTitleBar() {
  const { isDesktop } = useDesktop()
  const overlayVisible = ref(false)

  let overlay: WindowControlsOverlay | undefined
  const onGeometryChange = () => { overlayVisible.value = overlay?.visible ?? false }

  onMounted(() => {
    overlay = navigator.windowControlsOverlay
    if (!overlay) return
    overlayVisible.value = overlay.visible
    overlay.addEventListener('geometrychange', onGeometryChange)
  })
  onUnmounted(() => overlay?.removeEventListener('geometrychange', onGeometryChange))

  const mode = computed<'desktop' | 'overlay' | null>(() => {
    if (isDesktop.value) return 'desktop'
    if (overlayVisible.value) return 'overlay'
    return null
  })

  return {
    mode,
    /** True whenever the page, not the OS or browser, draws the strip across the top. */
    shown: computed(() => mode.value !== null),
  }
}
