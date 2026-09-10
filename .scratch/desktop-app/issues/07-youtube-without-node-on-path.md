# 07: YouTube imports without Node on PATH

**What to build:** The riskiest assumption in this whole effort, isolated into one ticket so it cannot quietly poison five others.

`server/lib/sources.ts:89` passes `--js-runtimes node` on **every** yt-dlp call. The Dockerfile is explicit about why: YouTube's player challenges are solved by running JavaScript in an external runtime, and Node — already the image's base — is what it shells out to. Contributors have Node on their PATH too, so nobody has ever felt this.

A singer who downloads an installer has no Node on their PATH. The code comments call the fallback "fewer format options", which was true when written; in practice YouTube now needs those challenges solved for most formats, so a missing JavaScript runtime is much closer to *YouTube import does not work* than to *works slightly worse*. That would break the headline feature for exactly the audience this whole effort exists for.

**The plan is to reuse the runtime already being shipped.** Electron *is* Node wearing a costume — the same trick tickets 02 and 04 already lean on. Put a copy or link of the Electron binary named `node` in a cache directory, hand yt-dlp a `PATH` containing it, and set `ELECTRON_RUN_AS_NODE=1` in the environment yt-dlp inherits and passes to its child. It costs nothing extra to ship.

It is also admittedly fragile — it depends on yt-dlp resolving `node` off the PATH it is given and on the environment surviving one process hop. **Verify it against a real YouTube URL before anything else depends on it.** If it does not hold, fall back to vendoring a small standalone JavaScript runtime (Deno or QuickJS) as a fourth bundled binary alongside ffmpeg, which is more bytes but no cleverness at all. Either outcome is fine; guessing between them is not.

**Blocked by:** 06 (yt-dlp has to exist before it can be handed a runtime)

**Status:** ready-for-agent

- [ ] Confirmed by running it: a packaged desktop app on a machine with **no Node on PATH** imports a real YouTube video, with the audio and metadata that arrive checked against the same import done in the compose image
- [ ] The runtime is provided by the Electron binary if that works, or by a vendored standalone JavaScript runtime if it does not; whichever it is, the reasoning and what was actually observed are written into this ticket's comments
- [ ] The mechanism is commented at the call site, because a future reader will not guess why a binary named `node` is being manufactured or why an Electron environment variable is being set for yt-dlp's benefit
- [ ] A missing or broken runtime degrades to a message naming the problem, rather than a generic yt-dlp failure a singer cannot act on
- [ ] Nothing changes for compose, `pnpm dev`, or `aspire run`, all of which have a real Node on PATH and must keep using it
- [ ] If the fallback is taken, ticket 05's installer size figure is updated to include it
