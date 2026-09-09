# 17: The Latency nudge is editable only while paused

**What to build:** Disable the Review screen's Latency nudge field while the Take is playing, and re-enable it the moment playback stops — whether that is an explicit pause or the clip reaching its own end.

This reverses a decision ticket 12 made on purpose. That ticket built the nudge as a typed field partly so it could be adjusted *during* playback ("Type a figure and press Enter while playing to align by ear"), and `TakeReviewEngine.setNudge` reschedules a running vocal for exactly that reason. The singer asked for the opposite, so the alignment loop is now pause → type → play → listen, and the field's help copy has to say that instead of promising the old one.

`TakeReviewEngine.setNudge` keeps its `if (this.playing) this.scheduleVocal()` branch. It is no longer reached from this screen, but it is the correct behavior for that method and `load` calls `setNudge` too; nothing is gained by making the engine refuse what the UI simply stops asking for.

**Blocked by:** None

**Status:** done

- [x] The nudge field is `disabled` while `state.playing`, and enabled again when playback stops, including when the clip ends on its own rather than being paused
- [x] The disabled state is visible, not just inert — the field and its `ms` unit dim, matching how the pitch slider already reads when tempo locks it
- [x] A line reading "Pause to change it." appears alongside while playing, so the field does not just look broken
- [x] The help copy no longer tells the singer to type a figure while playing
- [x] A figure typed but not committed does not survive into the disabled field: starting playback snaps the field back to the nudge actually in force, and clears any clamp notice
- [x] Committing while paused is unchanged — Enter, an arrow-key step, or leaving the field still applies, clamps, and saves

Out of scope: any change to `setNudge` on the engine, to the clamping and rounding of ticket 12, or to how the nudge is remembered per device.

## Comments

The last criterion is the one that needed real work rather than a `:disabled`
binding. A browser does not reliably fire `change` on an input it is about to
disable, so without it a half-typed figure would sit in a greyed-out field
looking as though it had been applied. A watcher on `state.playing` writes the
field back to `state.latencyNudgeMs` on the way into playback — the same
snap-back `onNudgeChange` already does after a clamp, for the same reason.

Verified live: paused, the field edits, commits on Enter, and persists (both
onto the Take and into the per-device `akapela:latency-nudge-ms`); playing, it
reports `disabled: true`, dims, and shows the hint; and when the 8-second Take
ran to its end on its own it came back enabled with the hint gone, without a
pause being pressed. A figure typed and then abandoned by pressing play left
the field showing the nudge in force, not the abandoned one.
