# 10: Docs, ADRs, and the device pass

**What to build:** The paperwork and the parts only a person with ears and a phone can do.

Two ADR changes, and only two. **ADR 0008** records choosing MDX-Net via `audio-separator` over Demucs: it passes all three bars — it is a dependency in the shipped image, "why not Demucs, which everyone uses?" is exactly what a future reader will ask, and the trade-off between image size, instrumental quality, and mainstream-ness was real. **ADR 0003 is amended**, not replaced, to add Backing Source to what stays changeable after a Take is sung; it is the same decision extended. Nothing else in phase two earns an ADR: the Backing Source toggle, the Stems layout, the `presets` table, and the Effect roster are all reversible and unsurprising, and `CONTEXT.md` and the spec carry them.

The manual checklist is the real work here. Separation quality cannot be asserted in a test suite — it is not testable and it is not ours — so it is verified by ear, once, on a real song with the real model.

**Blocked by:** 09 (Take and Mix carry Backing Source)

**Status:** ready-for-human

- [x] ADR 0008 (written with this spec) still describes what was actually built, including which model ended up in the image
- [x] ADR 0003's phase-two amendment (written with this spec) still matches how Backing Source behaves at Mix time
- [x] `CONTEXT.md`'s `Effects`, `Backing Source`, `Stems`, and `Adjustments` entries (written with this spec) still match the built vocabulary, with no implementation detail in any of them
- [x] `README.md` says what separation costs a self-hoster: minutes of CPU per song, ~80 MB per Track on disk, one network fetch of the model on first use, cached in the data volume
- [ ] Manual, on a real song with the real model: separation quality by ear on both Stems, the Backing Source toggle switching cleanly mid-session, both Effects swept while playing with no dropouts, each of the three built-in Presets, and a Mix matching what review played
- [ ] Manual, on a phone: the grown `AdjustmentsPanel` with the Preset pill row and the collapsed Effects section, thumb-reachable and not crowding the lyrics; carry phase one's outstanding device items (tickets 04, 07, 08) if they are still open

## Comments

The four paperwork boxes are closed. ADR 0008 and ADR 0003's amendment were
already accurate against the tree as built — checked line by line against
`worker/akapela_worker/separators.py` and `worker/akapela_worker/jobs/render.py` —
and needed no edits. `CONTEXT.md`'s four entries likewise already matched.
`README.md`'s Hardware section still said vocal removal was "not here yet";
it now names the real cost (minutes of CPU, ~80 MB per Track, one model
download cached on the data volume).

Phase one's own tickets 04, 07, and 08 are `done` at full boxes already
(see `.scratch/phase-one/spec.md`), so there is nothing of theirs left to
carry forward into this ticket's phone pass.

The two manual boxes are unchecked on purpose and left for a human: this
agent has no ears and no phone. What ran in a browser this session — a real,
previously separated Track, its Backing Source toggle, all three built-in
Presets applying live, the Effects sliders, and the volume slider — behaved
correctly on screen and in the console, but "sounds right" and "thumb-reachable
on a phone" are judgments only a person singing into one can make.
