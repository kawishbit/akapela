# 15: Seekable, synced dual-lane scrubber on the Review screen

**What to build:** The Review screen's playback progress (`app/pages/tracks/[id]/takes/[takeId].vue`) is a read-only `role="progressbar"` — there is no way to seek at all today; hearing a later part of a Take means playing through everything before it. Replace it with two synced, draggable lanes: one for the Take's own vocal clip (0 to `durationMs`), one showing where that sits against the Backing Track's own song position — so it's visually clear these are two different timelines advancing together, not one, and dragging either seeks both.

`TakeReviewEngine` (`app/audio/review-engine.ts`) already computes the relationship between the two: the vocal's own time zero lands at the Backing Track's song position `startPositionMs + nudgeMs` (`scheduleVocal`), and position reporting already derives `vocalElapsedMs` from the Backing Track's position (`onBackingPosition`). Seeking needs the reverse: given a target vocal-elapsed value, seek `this.backing` to `startPositionMs + target` (`BackingTrackEngine.seek` already exists) and reschedule the vocal source from that offset, whether paused or playing.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `TakeReviewEngine` gains a `seek(vocalElapsedMs)` that moves the Backing Track to `startPositionMs + vocalElapsedMs` and reschedules the vocal from there, working whether playback is running or paused
- [x] The Review screen shows two synced lanes: the Take's vocal clip position and the Backing Track's song position, both driven by the same `elapsedMs` update path
- [x] Dragging either lane seeks immediately (no waiting for playback to reach that point), and the other lane's display updates to match since both are driven by the one clock
- [x] Dragging while playing doesn't stop playback; dragging while paused leaves it paused at the new position
- [x] Seeking past the Take's own duration or before its start clamps to the valid range, matching `onBackingPosition`'s existing end-of-clip handling
- [x] Keyboard and screen-reader access to seeking is preserved (the existing `role="progressbar"` accessibility is upgraded to a real slider affordance, not lost)

## Comments

`BackingTrackEngine.seek` grew one line beyond posting to the worklet: it now
moves the interpolation anchor (`lastReport`) to the target as well. The
worklet does report back from a seek — its `seek` case calls `report()`
immediately — but not before the call returns, so without this
`backing.positionMs` answers with the old position for the frame it takes that
message to arrive, and `scheduleVocal` would place the vocal against a
position playback has already left. Anchoring here is also what makes the
existing seek-while-playing path honest, since `positionMs` interpolates from
that anchor.

`TakeReviewEngine.seek` is then three lines: clamp, seek the Backing Track to
`startPositionMs + clamped`, and re-run `scheduleVocal` if playing. No new
bookkeeping was needed for the paused case — the vocal is already stopped when
paused, and `play` recomputes the schedule from the Backing Track's position,
so a seek made while paused is picked up simply by playing.

The two lanes are two native `<input type="range">` elements, the same seek
control `PlayerBar` and the Sing screen already use (`@input` previews,
`@change` commits), which is where the keyboard and screen-reader support come
from — the old `role="progressbar"` is gone and both lanes are real sliders,
each with an `aria-valuetext` reading as a time rather than a raw millisecond
count.

The song lane spans the Take's own stretch of the song
(`startPositionMs` to `startPositionMs + durationMs`) rather than the whole
Backing Track. Spanning the whole song was tried first and is the wrong shape
for real Takes: the Take this was verified against is 8 seconds inside a
3:23 song, which left 96% of the lane dead travel that clamps back. The whole
song is still on screen — as the marker bar under the lane, where the Take's
stretch is highlighted against the full length, plus the times either side —
so the point of the two lanes survives: two clocks, different numbers, one
playhead.

`takeSongPosition` and `takeElapsedAt` went into `app/audio/song-time.ts`
alongside `songTimeAfter`, for the reason ticket 11 put `clampVolume` in its
own module: that is where pure logic can be reached by a plain
`tests/unit/*.test.ts`, and the clamping the last acceptance criterion asks
about is exactly what is covered there.

Verified live against a real Take (8.1 s, recorded from 0:15 of a 3:23 Track):
dragging the Take lane to 0:04 moved the song lane to 0:19 and dragging the
song lane back moved the Take lane with it; playing resumed from a position
sought while paused instead of from the top; and a drag mid-playback jumped
the playhead with the transport still running. Keyboard focus on either lane
steps it, and the two values stayed exactly `startPositionMs` apart
throughout.
