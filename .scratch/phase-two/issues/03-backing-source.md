# 03: Backing Source on the Track

**What to build:** Once Stems exist, what you sing over becomes a choice. `tracks` gains `backing_source` (`original` or `instrumental`, default `original`), which flips to `instrumental` by itself when a separation succeeds — the common case takes no extra tap — and can be switched back at any time, because separation is lossy and sometimes loses. A Track imported from a karaoke video will often sound better on its original audio than on anything a model extracts from it.

The Backing Track stream route resolves which file to serve from the Track's `backing_source`, with an explicit `?source=` override for auditioning. Switching is the one Adjustment that is a reload rather than a live parameter change — the engine fetches and decodes the other file and resumes at the same song position — and the UI should not pretend otherwise.

**Blocked by:** 02 (Separate action, separation state, and Stems in the API)

**Status:** ready-for-agent

- [ ] Migration adds `backing_source` to `tracks`, defaulting to `original`
- [ ] A successful separation sets `backing_source` to `instrumental`
- [ ] `PUT /api/tracks/:id/backing-source` switches it, rejecting `instrumental` on a Track with no Stems with a message saying so
- [ ] The Backing Track stream route serves the file the Track's `backing_source` names, and honours an explicit `?source=original|instrumental` override
- [ ] The browser engine can switch Backing Source mid-session: it decodes the other file and resumes at the same song position, showing that it is loading rather than appearing to hang
- [ ] Track detail and the Sing screen both show which Backing Source is playing, and Track detail can switch it
- [ ] API tests cover the switch, the no-Stems rejection, the automatic flip on separation success, and the stream route serving each source
