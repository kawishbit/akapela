# 09: Take and Mix carry Backing Source; Review override

**What to build:** The piece that makes a Take permanent. A Take records the Backing Source it was sung to, so a Mix reproduces what the singer heard by default. A Mix carries its own copy, overridable on the Review screen exactly as pitch already is.

This is not bookkeeping. It buys two things worth naming:

- Sing along to the **original**, with the real singer audible keeping you on pitch, then render the Mix against the **Instrumental Stem** so only your voice is on it.
- A Take recorded in phase one, before Stems existed, is re-renderable against an instrumental you separate tomorrow. Nothing already sung ever goes stale.

Tempo stays locked to the Take — the vocal was sung to it. Pitch, both Effects, and now Backing Source are all Mix-time parameters. This extends ADR 0003's list rather than contradicting it; ticket 10 amends that ADR to say so.

**Blocked by:** 03 (Backing Source on the Track), 07 (Effects in the Mix render)

**Status:** ready-for-agent

- [ ] `takes` gains `backing_source`, defaulting to `original` so every phase-one Take keeps meaning what it meant
- [ ] Recording a Take stores the Backing Source in force at the time, alongside the Adjustments it already stores
- [ ] `mixes` gains `backing_source`, copied onto the row at request time and defaulting to the Take's own
- [ ] The Mix request accepts a Backing Source override, rejecting `instrumental` when the Track has no Stems
- [ ] The render job reads the backing input file from the Mix's `backing_source`, so a Mix reproduces its own source regardless of what the Track has been switched to since
- [ ] The Review screen offers the override next to the pitch control, showing tempo's lock the same visible way, and auditions the chosen source through the stream route's `?source=` parameter
- [ ] Tests cover a phase-one Take re-rendered against a newly separated instrumental, the override reaching the rendered file, and the no-Stems rejection
