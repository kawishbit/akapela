# Spec: Stem Levels

Status: done

Capitalised terms (Backing Source, Backing Track, Stems, Stem Levels, Guide Vocal, Separation, Take, Mix, Adjustments) are defined in `CONTEXT.md`.

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Backing Source is Original or Stems, with Stem Levels](issues/01-domain-and-storage.md) | done | — |
| 02 | [The Mix blends the Stems before the stretch](issues/02-mix-render.md) | done | 01 |
| 03 | [The browser engine blends the Stems before Rubber Band](issues/03-browser-engine.md) | done | 01 |
| 04 | [Sliders on the Track page and the Sing screen](issues/04-track-and-sing-sliders.md) | done | 01, 03 |
| 05 | [Stem Levels on Review and in the Mix](issues/05-review-and-mix.md) | done | 01, 02, 03 |
| 06 | [ADR 0003 amendment and docs](issues/06-adr-and-docs.md) | done | 01 |

01 comes first. 02, 03, and 06 can land in any order after it. 04 and 05 need the engine (03), and 05 also needs the render (02).

## Problem Statement

Once a Track has been separated, the Backing Source is a two-way switch: the original recording, with the original singer at full volume, or the Instrumental Stem, with no singer at all. Many singers want something in between, the original singer faintly audible so they can stay on pitch and remember the phrasing, then no guide at all on the Mix they keep. Some want the opposite: the vocal alone, to practise against.

## Solution

A separated Track can take its Backing Track from **Stems**, blended at two **Stem Levels**: the **Guide Vocal** (the Vocals Stem) and the **Instrumental** (the Instrumental Stem), each from 0% (silent) to 100% (as separated). The levels change live as a slider moves, like any other Adjustment. A Take records the levels in force when recording started. Review and the Mix can change them, so a singer can sing with a 30% Guide Vocal and render the Mix at 0%.

## Decisions

- **Backing Source becomes `original | stems`.** `stems` carries the Stem Levels. Today's `instrumental` is exactly Stems at Guide Vocal 0% / Instrumental 100%, and every Track, Take, and Mix stored as `instrumental` reads as that, so nothing already recorded or rendered changes meaning. Original stays: it is exact and lossless, and the Stems summed at 100/100 are not quite the original (separation artefacts, a possibly lossy Audio Format).
- **Two independent levels, 0–100% each.** No boost above 100%: a louder guide comes from lowering the Instrumental, and boosting a Stem boosts its artefacts and risks clipping. Both at 0% is allowed and plays silence.
- **Remembered per Track**, next to its Backing Source. How much guide a singer needs depends on the song, not the device.
- **The levels outlive the files.** Separating again with another Separation Model keeps them. Deleting the Stems sets the Backing Source to Original as it does today, but keeps the remembered levels for when Stems come back. A successful Separation still switches the Backing Source to Stems, using the Track's remembered levels (0/100 by default).
- **A Mix-time parameter** (ADR 0003 amendment, ticket 06). A Take records the Backing Source and Stem Levels **as they were when recording started**, as the recorder already does for the Adjustments. The sliders stay live during recording (fading the guide out mid-song is a real use), but the Take stores the starting value and no automation. Review can change the levels and saves them on the Take. A Mix carries its own copy.
- **One stretch, blended first, on both sides.** The browser decodes both Stems and sums them at their levels *before* the Rubber Band worklet. A level change is heard after the stretcher's short buffer (about 100–200 ms), which is acceptable. At Guide Vocal 0% the Vocals Stem is not fetched at all, so today's instrumental playback costs no more than it does now. The render does the same: blend in ffmpeg, then stretch once.
- **Review's backing gain is unchanged.** Stem Levels shape *what* the Backing Track is, and backing gain still sets how loud the result sits against the singer's vocal.
- **The Sing choice dialog stays a quick choice** between Original and Stems at the Track's remembered levels. The sliders are on the Track page's Stems panel, the Sing screen, and Review.
- **Localised from the start.** New strings go into `i18n/locales/en.json` and `id.json`, with Guide Vocal and Stem Levels added to `i18n/glossary.md`. Any new failure is a code in `shared/error-codes.ts` (ADR 0014).

## Out of scope

- Per-Stem Effects (the Guide Vocal gets no reverb of its own; the Effects Target still names the Backing Track as a whole)
- Level automation over the course of a Take
- More than two Stems (drums, bass, and so on)
- Boosting a Stem above as-separated
