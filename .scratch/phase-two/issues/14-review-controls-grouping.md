# 14: Group Review controls by what they actually affect

**What to build:** The Review screen (`app/pages/tracks/[id]/takes/[takeId].vue`) lists every control — nudge, vocal gain, backing gain, pitch, Backing Source, Reverb, Low-pass, tempo — as one flat stack with no visual distinction between what shapes the recorded vocal and what shapes the Backing Track. Vocal gain is the only control that touches the vocal at all; pitch, tempo, and Backing Source are Backing-Track-only; Reverb and Low-pass now (ticket 13) depend on a per-control target rather than a fixed side. Group and label the controls so that's legible at a glance: a "Your voice" section (vocal gain) and a "Backing Track" section (pitch, tempo, Backing Source), with Reverb and Low-pass showing their own target picker from ticket 13 inline rather than sitting ambiguously in either group.

**Blocked by:** 13 (Effects target)

**Status:** done

- [x] Review screen controls are visually grouped into "Your voice" and "Backing Track" sections, or equivalent labeling, matching what each control actually changes
- [x] Reverb and Low-pass show their target (from ticket 13) directly alongside their sliders, not filed under either fixed group
- [x] Copy makes explicit that pitch, tempo, and Backing Source only ever shape the Backing Track — the recorded vocal is always dry (ADR 0003)
- [x] No change in behavior, only layout and labeling — every control still calls the same `review.set*` functions it already does
