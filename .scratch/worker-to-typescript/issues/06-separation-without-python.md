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

## Known gap carried to ticket 07

The ONNX inference runs on the main thread, not isolated via
`worker-thread.ts`'s primitive (built in ticket 02, proven not to block the
event loop) or a subprocess. A real separation — minutes, not seconds, per
ADR 0008 — will block other requests for its duration; the Python worker
never had this problem because it was already a separate OS process.
`worker-thread.ts` turned out to need a worker entry point that survives
Nitro's production bundling, which wasn't resolved in the time available;
`child_process` (matching how ffmpeg/yt-dlp already run) is the more likely
answer, sidestepping bundler-path concerns entirely by spawning a real Node
process the same way those already do. This needs a decision and a fix
before or as part of ticket 07 — noted there.
