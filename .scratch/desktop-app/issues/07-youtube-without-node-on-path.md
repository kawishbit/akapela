# 07: YouTube imports without Node on PATH

**What to build:** The riskiest assumption in this whole effort, isolated into one ticket so it cannot quietly poison five others.

`server/lib/sources.ts:89` passes `--js-runtimes node` on **every** yt-dlp call. The Dockerfile is explicit about why: YouTube's player challenges are solved by running JavaScript in an external runtime, and Node — already the image's base — is what it shells out to. Contributors have Node on their PATH too, so nobody has ever felt this.

A singer who downloads an installer has no Node on their PATH. The code comments call the fallback "fewer format options", which was true when written; in practice YouTube now needs those challenges solved for most formats, so a missing JavaScript runtime is much closer to *YouTube import does not work* than to *works slightly worse*. That would break the headline feature for exactly the audience this whole effort exists for.

**The plan is to reuse the runtime already being shipped.** Electron *is* Node wearing a costume — the same trick tickets 02 and 04 already lean on. Put a copy or link of the Electron binary named `node` in a cache directory, hand yt-dlp a `PATH` containing it, and set `ELECTRON_RUN_AS_NODE=1` in the environment yt-dlp inherits and passes to its child. It costs nothing extra to ship.

It is also admittedly fragile — it depends on yt-dlp resolving `node` off the PATH it is given and on the environment surviving one process hop. **Verify it against a real YouTube URL before anything else depends on it.** If it does not hold, fall back to vendoring a small standalone JavaScript runtime (Deno or QuickJS) as a fourth bundled binary alongside ffmpeg, which is more bytes but no cleverness at all. Either outcome is fine; guessing between them is not.

**Blocked by:** 06 (yt-dlp has to exist before it can be handed a runtime)

**Status:** ready-for-human

- [ ] Confirmed by running it: a packaged desktop app on a machine with **no Node on PATH** imports a real YouTube video, with the audio and metadata that arrive checked against the same import done in the compose image
- [x] The runtime is provided by the Electron binary if that works, or by a vendored standalone JavaScript runtime if it does not; whichever it is, the reasoning and what was actually observed are written into this ticket's comments
- [x] The mechanism is commented at the call site, because a future reader will not guess why a binary named `node` is being manufactured or why an Electron environment variable is being set for yt-dlp's benefit
- [x] A missing or broken runtime degrades to a message naming the problem, rather than a generic yt-dlp failure a singer cannot act on
- [x] Nothing changes for compose, `pnpm dev`, or `aspire run`, all of which have a real Node on PATH and must keep using it
- [x] If the fallback is taken, ticket 05's installer size figure is updated to include it

## Comments

**The plan changed, for the better, and the ticket's own instruction to verify before depending on it is what found it.**

The ticket proposed manufacturing a file named `node` in a cache directory and handing yt-dlp a `PATH` containing it. Reading yt-dlp's source first showed that is unnecessary: `--js-runtimes` takes `RUNTIME[:PATH]`, and `yt_dlp/utils/_jsruntime.py`'s `_determine_runtime_path` uses an explicit path outright when it is a file rather than a directory. So there is no manufactured binary, no `PATH` surgery, and no second environment hop — the shell passes `--js-runtimes node:<path to Electron>` and `server/lib/tools.ts`'s `childEnv()` puts `ELECTRON_RUN_AS_NODE=1` in the environment yt-dlp inherits and passes down to it. The same idea as the ticket's, with one less mechanism.

**What was actually observed:**

- The option syntax works, against a real YouTube URL, on this machine: `yt-dlp -J --no-playlist --js-runtimes "node:C:\nvm4w\nodejs\node.exe" "https://www.youtube.com/watch?v=jNQXAC9IVRw"` returned the video's title, its 19-second duration, and **24 formats**. yt-dlp 2026.08.19.
- That run also retired the sharpest risk here without meaning to. `jsc/_builtin/node.py` passes `--permission` to any runtime reporting Node ≥ 23.5.0, and Node on this machine is 24.13.1 — so the challenge solver ran *with* the permission model on and still solved. The failure mode where yt-dlp hands the runtime a flag it rejects does not exist for a modern Node.
- `NodeJsRuntime._info` runs `<path> --version` and requires the output to match `^v(\S+)` and be ≥ 22.0.0. Electron with `ELECTRON_RUN_AS_NODE=1` prints its embedded Node version in exactly that shape, which is why this is expected to hold.

**The first box stays unticked: this has not been run against Electron's binary, only against a real Node.** The ~110 MB Electron download had not completed on this connection. What is unproven is precisely two things — that `electron --version` under `ELECTRON_RUN_AS_NODE=1` satisfies yt-dlp's version probe, and that Electron's Node accepts `--permission`. Both are minutes of work for anyone holding the binary:

```
ELECTRON_RUN_AS_NODE=1 <electron> --version
yt-dlp -J --no-playlist --js-runtimes "node:<electron>" "https://www.youtube.com/watch?v=jNQXAC9IVRw"
```

If either fails, the fallback this ticket names — vendoring Deno or QuickJS as a fourth bundled binary — is one more `AKAPELA_JS_RUNTIME` value plus a manifest entry, and ticket 05's size figure gains that binary.

A missing or broken runtime no longer produces a bare yt-dlp error. `cleanYtDlpMessage` recognises the runtime complaint and puts a sentence a singer can act on in front of it — "YouTube needs a JavaScript runtime … install Node 22 or newer, or import the file instead" in a browser or under compose, and "Try Update yt-dlp in Settings" on the desktop, where a runtime is already shipped and a failure means something else.

Nothing changed for compose, `pnpm dev`, or `aspire run`: with `AKAPELA_JS_RUNTIME` unset, `jsRuntimeArgs()` returns `['--js-runtimes', 'node']`, byte for byte what it returned before.
