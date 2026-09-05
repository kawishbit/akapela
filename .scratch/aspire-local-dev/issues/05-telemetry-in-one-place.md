# 05: Telemetry lands in one place

**What to build:** When an import or a Mix goes wrong, a contributor can follow it in one view instead of stitching together a browser console, a Nuxt terminal, and a Worker terminal. The app's server, the Worker, and the browser all report into the dashboard, so a click that enqueues a Job can be followed through the API route to the Worker picking it up and shelling out to ffmpeg.

**Blocked by:** 02 (The Worker joins the graph and the Job loop closes)

**Status:** ready-for-human

- [x] The app's server-side requests appear in the dashboard as traces, with API routes identifiable by path
- [x] The Worker's Job execution appears as spans covering the Job's lifetime, correlated with the request that enqueued it
- [x] Browser console errors and warnings from the app reach the dashboard, so a failure while recording a Take is visible without opening devtools
- [x] Telemetry is dev-only: running under compose or `pnpm dev` exports nothing and requires no collector, and nothing is sent off the machine
- [x] Instrumentation adds no measurable latency to Backing Track playback or Take recording

## Comments

Both halves export OTLP to the Dashboard, and the browser relays its console through the server rather than exporting for itself.

**The app's server.** A Nitro plugin opens a span per request, named for the route rather than the URL — `POST /api/tracks/:id/takes`, with the real path kept as `url.path` — so the trace list groups instead of listing one entry per Track. Nitro knows the route it matched but only inside its own router, so `server/lib/routes.ts` recognises id segments and folds them back into the template. The same module filters what is not worth a span: one page load in development is dozens of `/_nuxt/*` requests, and tracing those would bury the handful of API calls the list exists for. Verified against a real run — `GET /`, `GET /api/tracks`, `GET /api/tracks/:id/cover`, and nothing from the dev server.

**The Worker.** A `job <type>` span per Job, opened the moment it is claimed and closed after the row reaches `succeeded` or `failed` — the terminal write is inside the span, not after it, or the span would cover the handler rather than the Job. The runner swallows a handler's failure by design (it belongs on the job row), so the span is told about it explicitly through the handle `job_span` yields; a test asserts the row already says `succeeded`/`failed` at the moment the span closes, because that is the difference the eye cannot see in a Dashboard.

**Correlating them** needed a `trace_parent` column on `jobs` (migration `0007`). The app stamps it when it enqueues; the Worker extracts it as the parent of its span. Confirmed end to end: `POST /api/jobs` returned `00-e546134c…-6415b0ad…-01`, and the Dashboard shows trace `e546134c…` with two spans across both resources.

**The browser** posts `console.error` and `console.warn` to `/api/telemetry/browser`, which the server emits as log records. Verified in a real browser: a `console.error` and a `console.warn` on the library page arrived in the Dashboard at FAIL and WARN, and a `console.log` did not.

Four decisions worth recording.

- **The browser relays rather than exports.** Exporting from the page would mean an OTLP client in the bundle a self-hoster downloads and CORS configured on the Dashboard. Relaying costs one POST, keeps the client bundle unchanged, and means the page never learns whether anyone listened — which is what stops a failing page from retrying. The endpoint answers 204 to everything, valid or not, and `server/lib/browser-logs.ts` is the gate: warnings and errors only, capped in count and length, everything else dropped without complaint.

- **The trace reaches `enqueueJob` out of band.** It is four domain functions below the route handler that holds the span, and threading a telemetry string through `createMix`, `retryMix`, `createTrackFromUpload` and `retryImport` would have put it in six signatures where the next function to enqueue a Job would have to remember it too. An `AsyncLocalStorage` in `server/lib/request-trace.ts` carries it instead. It has to be entered from a *middleware*, not from the plugin's `request` hook: hookable calls hooks from inside a promise callback and a store entered there is gone by the time the handler runs. That cost a debugging round — spans exported fine while every Job came out with a null trace. The store holds a box the response empties, because `enterWith` cannot hand the store back and a context outliving the request should hold nothing rather than a stale trace.

- **gRPC, not HTTP.** The AppHost asks for nothing in particular now. Asking for `HttpProtobuf` was accepted and then not honoured — the injected env stayed `grpc` — and the Dashboard's OTLP endpoint refuses HTTP outright, which is worth knowing before anyone tries again. Aspire hands Python `OTEL_EXPORTER_OTLP_CERTIFICATE`, which its exporter reads by itself; for Node it sets `NODE_EXTRA_CA_CERTS` instead, which the gRPC exporter does not look at, so `server/lib/telemetry.ts` reads whichever is set and builds the channel credentials. Without that the Dashboard is empty and nothing says why.

- **How dev-only stays true.** Both sides load nothing unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and `import.meta.dev` keeps the app's half out of the production build. That was not enough on its own: Rollup resolves a dynamic import and records it as an external while building the module graph, long before it discards the dead branch, and Nitro then copied every OpenTelemetry and gRPC package into `.output` — 2.4 MB of an image that would never load them. The specifiers are now assembled at runtime so the bundler has nothing to resolve. `.output` has no `@opentelemetry` in it, the client bundle has no relay in it, and the Worker's image installs `--no-dev`. Checked by running `pnpm dev` on its own: page serves, Job enqueued with a null trace, relay answers 204 and drops, `telemetry:""` in the client payload, nothing in the log about OTLP.

**What the review changed.** Five things, all worth having.

- The Worker's span closed before the terminal `UPDATE`, so it covered the handler and not the Job. Widened, and pinned by two tests.
- `server/api/telemetry/browser.post.ts` and `server/middleware/telemetry.ts` had no `import.meta.dev` guard, so the compose image shipped a live unauthenticated endpoint that read an arbitrary body to throw it away. Both are guarded now, and the shipped chunk is one line: `throw createError({ statusCode: 404 })`. `enterWith` appears zero times in `.output`.
- `enterWith` reaches the frame that called it, and under keep-alive two requests can share that frame — so an untraced request could have inherited its predecessor's trace. Nothing that enqueues a Job is untraced, so it was latent, but every request now enters a store of its own, `null` when it has no trace.
- `@opentelemetry/semantic-conventions` was installed and never imported. Removed.
- `truncate` existed twice, the page limit was a bare `500` on the server and absent on the client, and there were two unrelated `describe()` functions. The limit and the helper are in `shared/browser-log.ts` now, used by both ends.

Three review findings were left alone, deliberately. The client's `window.error` and `unhandledrejection` listeners look like scope beyond "console errors and warnings", but a browser does not route an uncaught error through `console.error`, so without them the criterion is not met. `routeTemplate` recognises only UUID segments, which is what every id in this codebase is; matching more shapes would start folding real route names. And `worker` stays lowercase in `server/` comments, matching every neighbour there, even though `AGENTS.md` capitalises it.

**Latency.** Nothing was added to a hot path to measure. Playback and recording are browser audio and touch none of this; the relay patches `console.warn` and `console.error`, which no Akapela code calls, and queues into a `setTimeout` rather than sending. On the server a span is two timestamps and a string, including on the byte-range routes the audio path uses — observed at 0.98–2.16 ms for `GET /api/tracks` end to end. The Worker opens one span when it claims a Job, not per frame and not around ffmpeg's output.

**Adjacent fix.** `tests/api/harness.ts` binds an ephemeral port, and this machine's range has drifted into the ports Node's `fetch` refuses outright (6665–6669 and friends), which surfaced as unrelated tests failing with `bad port`. The harness now asks for another port when it gets one of those. Pre-existing and environmental, but it made a clean suite run impossible.
