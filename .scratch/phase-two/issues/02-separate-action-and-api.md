# 02: Separate action, separation state, and Stems in the API

**What to build:** The app half of vocal removal: the button that starts it and the state that renders it. `tracks` gains a `separation_state` (`none`, `separating`, `ready`, `failed`) mirroring `import_state` — the Job carries the mechanics, the Track carries what the card shows. Track detail grows a **Separate** button that enqueues the Job, and a failed separation shows its error with a retry, the same shape a failed import already has.

The one deliberate departure from phase one's conventions is the progress display. Separation takes minutes and the model gives no meaningful progress signal, so the UI shows an **elapsed timer** ("Separating… 2:14") rather than a percentage bar. A bar sitting at 10 percent for four minutes reads as broken rather than working, and the remaining time genuinely is not knowable.

**Blocked by:** 01 (Separator interface, separate Job, and Stems on disk)

**Status:** done

- [x] Migration adds `separation_state` to `tracks`, defaulting to `none`, and the schema comment says why it exists alongside the Job
- [x] `POST /api/tracks/:id/separate` enqueues a separate Job and moves the Track to `separating`; requesting one on a Track already separating is rejected rather than queueing a second
- [x] `POST /api/tracks/:id/separate/retry` re-enqueues a failed separation on the same Track, matching the import retry shape
- [x] `separation_state` and the separate Job appear on the Track detail response so the page can render state without a second call
- [x] Track detail shows a Separate button, and while separating shows an elapsed timer rather than a percentage
- [x] A failed separation shows its error message with a retry button
- [x] API tests cover the separate request, the double-request rejection, retry, and the Track's state transitions
