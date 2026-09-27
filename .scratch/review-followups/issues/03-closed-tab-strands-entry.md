# 03: A tab closed before the Queue loads strands its entry

**Status:** needs-triage

**What happens:** `app/composables/useQueueTurn.ts` only uses up the entry once it has seen it in the Queue for that Track (`current` is set). That check is what makes a stale or bogus `?entry=` harmless. But a Sing screen opened with `?entry=…` and closed before `GET /api/queue` has answered never sets `current`, so `pagehide` has nothing to remove and the entry stays in the Queue. A reload recovers, because the page mounts again. A closed tab doesn't.

**Spec it bends:** `.scratch/queue/issues/05-singing-an-entry.md`: "A reload or a closed tab still removes the entry, or removes it on the next visit — it never strands."

**Why it was left:** it needs the tab closed within the first fetch of the Sing screen, and the entry is still visibly first on everyone's Queue, one tap from **Remove**.

**A way to fix it:** let the server do the check. A `DELETE /api/queue/:id?trackId=…` (or a small `POST /api/queue/:id/consume` taking the Track id) removes the entry only when it belongs to that Track, so `consume()` can fire on `pagehide` from the URL alone without waiting to validate on the client.

**Test:** an API test that the consume route refuses an entry of another Track and removes one of this Track.

## Comments
