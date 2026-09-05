# 05: Telemetry lands in one place

**What to build:** When an import or a Mix goes wrong, a contributor can follow it in one view instead of stitching together a browser console, a Nuxt terminal, and a Worker terminal. The app's server, the Worker, and the browser all report into the dashboard, so a click that enqueues a Job can be followed through the API route to the Worker picking it up and shelling out to ffmpeg.

**Blocked by:** 02 (The Worker joins the graph and the Job loop closes)

**Status:** ready-for-agent

- [ ] The app's server-side requests appear in the dashboard as traces, with API routes identifiable by path
- [ ] The Worker's Job execution appears as spans covering the Job's lifetime, correlated with the request that enqueued it
- [ ] Browser console errors and warnings from the app reach the dashboard, so a failure while recording a Take is visible without opening devtools
- [ ] Telemetry is dev-only: running under compose or `pnpm dev` exports nothing and requires no collector, and nothing is sent off the machine
- [ ] Instrumentation adds no measurable latency to Backing Track playback or Take recording
