# 06: ADR 0003 amendment and docs

**What to build:** A new amendment at the end of `docs/adr/0003-live-dsp-in-browser-final-render-on-server.md`, titled "Backing Source is a blend of Stems". It records:

- The Backing Source is `original | stems`, and `stems` carries Stem Levels (Guide Vocal, Instrumental, 0–100% each). `instrumental` is read everywhere as Stems at 0/100, so nothing already recorded or rendered changes meaning.
- The levels are a Mix-time parameter, on the same side of the line as pitch and the Effects: recorded on a Take as they were when recording started, changeable on Review, and copied onto each Mix.
- Both engines blend the Stems **before** the one Rubber Band stretch, so a blend is stretched once and the preview and the render still run the same stretch on the same signal. The cost in the browser is a short delay on level changes, and a second decoded buffer that is only fetched when the Guide Vocal is above 0.
- Why Original was kept rather than treated as Stems at 100/100: it is exact and lossless, and the Stems are not.

Also check that `CONTEXT.md`'s **Backing Source**, **Stem Levels**, and **Guide Vocal** entries (written during design) still match what shipped. Add a line to `ROADMAP.md` if it tracks this, and to the user-facing docs if the Backing Source switch is described there.

**Blocked by:** 01

**Status:** done

- [x] The ADR 0003 amendment is written
- [x] `CONTEXT.md` entries match what shipped
- [x] Any doc that describes "Original / Instrumental" now says "Original / Stems"
