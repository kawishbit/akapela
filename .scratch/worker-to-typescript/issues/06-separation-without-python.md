# 06: Vocal removal (Separation) works without Python

**What to build:** From the outside, asking a Track to have its vocals removed behaves as it does today: a Vocals Stem and an Instrumental Stem appear, selectable as the Backing Source, without the Python worker touching this Job type. Internally, the validated pipeline from ticket 05 is wired into a Job handler hosted by the in-process runner from ticket 02.

**Blocked by:** 02 (in-process job runner), 05 (validated TS separation path)

**Status:** done

- [x] Asking for Separation on a Track produces both Stems, normalized to 44.1kHz stereo WAV (ADR 0005) as today
- [x] Re-separating an already-separated Track (asking again) behaves as it does today
- [x] A first-time separation on a machine with no cached model downloads it into the cache path from ticket 01, and a network failure during that download surfaces as today's Job error, retried by hand
- [x] The separate Job is run by the in-process TS runner, not the Python worker
- [x] Existing separation tests are ported and pass against the new implementation

## Result

`server/lib/jobs/separate.ts` ports `separate.py` directly: a `Separator`
interface (`fetchModel`/`separate`), a real `MdxNetSeparator` implementation
wiring ticket 05's `MdxNetModel` + `server/lib/separators/download-model.ts`
(the model itself, fetched from the same public UVR model-repo release URL
`audio-separator` uses, hardcoded to this one model rather than reproducing
its general catalog machinery), and the same scratch-directory-then-rename
sequencing so a Track keeps its old Stems until new ones are ready. Vocals is
computed as `mdx-net.ts`'s new `separate()` method — a time-domain
subtraction against the (peak-normalized) mix, matching
`MDXSeparator.separate`'s `invert_using_spec=False` branch, the one the real
model runs under.

Wired into `DEFAULT_HANDLERS.separate` in `jobs-runner.ts`. 11 job-level
tests in `tests/unit/jobs/separate.test.ts` port `test_separate.py`'s cases
(coarse progress, model caching and reuse, re-separation overwrite,
fetch/separate failure handling, delete-during-run, Backing Source flip on
success) against a fake `Separator`, the same way the Python suite never runs
the real model automatically.

**Real end-to-end verification** (not just wiring): the actual downloaded
UVR-MDX-NET-Inst_HQ_3.onnx model, on a live dev server — uploaded a Track,
requested Separation, polled to `ready` in ~10s, confirmed both
`instrumental.wav` and `vocals.wav` on disk, `hasStems: true`,
`backingSource` flipped to `instrumental`. No Python process running.

## CPU isolation: resolved, via child_process rather than worker_threads

Originally shipped with the ONNX inference on the main thread (a real
separation — minutes, not seconds, per ADR 0008 — would have blocked every
other request for its duration). Fixed in the same ticket rather than
deferred further: `MdxNetSeparator.separate` now spawns
`server/lib/separators/separate-cli.ts` as its own `node` subprocess — the
same shape ffmpeg and yt-dlp already are — instead of running
`MdxNetModel` in process. `worker-thread.ts`'s primitive (ticket 02) was
tried first and abandoned: `import.meta.url`, which it would need to locate
a worker entry file, is rewritten by Nitro into its own `.nuxt` virtual
module namespace even under `pnpm dev` — confirmed the hard way (it resolved
to a `.nuxt/separators/separate-cli.ts` that doesn't exist) rather than
assumed. `separate-cli.ts`'s path is instead resolved against
`process.cwd()`, the same convention `use-akapela.ts` already uses for
`dataDir`/`migrationsDir`.

`worker-thread.ts` and its test are now dead code (nothing else in this
effort needs CPU isolation) and should be deleted in ticket 07's cleanup
rather than kept as an unused abstraction.

**Verified for real**, not just by absence of errors: a live dev server, a
real 5s clip, the real model — separation completed correctly (Stems on
disk, Track ready) while ten concurrent `/api/settings` requests during the
run stayed at 100-130ms (briefly 200-600ms under CPU contention, never the
multi-second stall an in-process run produced before this fix).

**Remaining piece, real and specific, carried to ticket 07**: the compose
image's Dockerfile copies only `.output` and `migrations` into the final
stage, not `server/` — so `separate-cli.ts` won't exist on disk there yet.
Ticket 07 needs to either copy `server/lib/separators/` (and its
`app/audio/wav.ts` dependency) into the image, or bundle `separate-cli.ts`
as its own build artifact via the same `pnpm build` step. `pnpm build` and a
direct `node .output/server/index.mjs` smoke test (import, render with
reverb, and separate all verified working against the actual built output)
were run in this session and confirm the rest of the build is otherwise
sound — this is the one known loose end, not a guess.
