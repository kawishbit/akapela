# 11: Volume control for Backing Track playback

**What to build:** A volume slider that lowers how loud the Backing Track plays while listening — on the persistent `PlayerBar` and on the Sing screen's own transport (which hides the `PlayerBar` and builds its own). Both surfaces drive the one shared player, so dragging either slider changes loudness immediately while the song keeps playing, exactly like pitch and tempo do, with no reload.

This is a listening preference, not an Adjustment: it is never sent to the server, never stored on the Track, a Take, or a Mix, and never touches Presets, Effects, or the worker's render. It lives entirely in the browser, remembered per-device across reloads the same way the Review screen's latency nudge already is (`localStorage`, not synced across devices). `CONTEXT.md`'s **Monitoring** entry already reserves "Playback" for hearing the Backing Track, as distinct from hearing your own voice — this ticket is that Playback, made adjustable.

The hookup point already exists: `BackingTrackEngine.setGain(gain)` in `app/audio/engine.ts` sets a linear gain stage on the Backing Track's output, but today only `TakeReviewEngine` calls it (for the Review screen's post-recording backing/vocal balance, an unrelated per-Take control). `usePlayer` — the engine instance behind the `PlayerBar`, the Track detail page, and the Sing screen — has no volume state or control at all yet.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `usePlayer` carries a `volume` value (0 to 1, default 1 = unity, matching today's unadjusted loudness) in its shared state, applies it to the engine via `setGain` immediately on change, and persists it to `localStorage` (loaded once on first use, the way the Review screen's nudge default is)
- [x] A volume slider is shown in the `PlayerBar` and reads/writes that same state
- [x] A volume slider is shown in the Sing screen's transport footer (`sing.vue`), reading/writing the same state, since `definePageMeta({ playerBar: false })` means the `PlayerBar`'s slider never reaches this screen otherwise
- [x] Dragging either slider to 0 plays back silently while position, the seek bar, and Lyrics scrolling keep advancing normally — it is a gain change, not a pause
- [x] The chosen volume survives a page reload and carries over between Tracks, the way a hardware volume knob would
- [x] Unit tests cover the clamping and persistence logic added to `usePlayer` (out-of-range input, load-once-on-first-use, a missing/unavailable `localStorage` failing open the way `useTakeReview`'s nudge storage already does)

Out of scope: sending volume to the server, a per-Track saved level, and any effect on a rendered Mix or a Take's own vocal/backing balance (that remains the Review screen's separate `vocalGain`/`backingGain`, untouched by this ticket).

## Comments

The clamping and persistence logic lives in a new plain module,
`app/audio/volume.ts` (`clampVolume`, and a `VolumeStore` class owning the
load-once and fail-open-on-missing-`localStorage` behavior), rather than
inline in `usePlayer.ts` — that composable relies on Nuxt auto-imports this
repo's Vitest setup does not provide, so the pure logic needed to live
somewhere a plain `tests/unit/*.test.ts` could reach it directly, the way
`shared/*.ts` and the rest of `app/audio/*.ts` already are. `usePlayer` holds
one `VolumeStore` at module scope (alongside the existing single `engine`) and
wires it into the reactive `state.volume` and `setGain`.

Verified live in a browser against a real, separated Track: the volume
slider drags smoothly on both `PlayerBar` and the Track detail page's mini
player, the chosen level survives a full page reload, and a saved Preset
pill applies its five fields audibly with no reload — confirming ticket 08's
same live-update path stayed intact.
