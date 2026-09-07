# 08: Presets: table, built-ins, API, and the pill row

**What to build:** A named bundle of Adjustments, one tap to apply. Three ship with the app:

| Preset | Pitch | Tempo | Linked | Reverb | Low-pass |
| - | - | - | - | - | - |
| **Slowed and Reverb** | — | 85% | yes | 65 | 8 kHz |
| **Nightcore** | — | 130% | yes | 20 | off |
| **Practice** | 0 | 80% | no | 0 | off |

The first two are linked, so pitch follows tempo the turntable way — that *is* the genre in both cases, and it is why `linked` exists. Practice is the one that serves the app's actual purpose: slow the song to learn it while the key stays exactly where you will sing it.

A Preset carries **Adjustments and nothing else**. Not Backing Source, which is meaningless on a Track with no Stems; not Lyrics Offset, which is a per-Track correction a Preset would corrupt; not the gains, which belong to a Take that does not exist yet when you pick a Preset. That congruence is what lets applying one be a single assignment.

Two things that are deliberately *not* Presets: Reset, which already has its own button and would behave unlike every other row in the list; and lower/raise the key, which the pitch stepper already does in one tap.

**Blocked by:** 05 (Effects on Adjustments)

**Status:** ready-for-agent

- [ ] A `presets` table with id, name, the five Adjustments fields, a `built_in` flag, and timestamps
- [ ] The migration seeds the three built-ins above with `built_in = 1`
- [ ] `GET /api/presets` lists built-ins first, then user Presets
- [ ] `POST /api/presets` saves the submitted Adjustments under a name, rejecting a blank or duplicate name
- [ ] `DELETE /api/presets/:id` deletes a user Preset and rejects a built-in with a message saying it ships with the app
- [ ] `AdjustmentsPanel.vue` shows Presets as a row of pills above the controls, expanded rather than collapsed, with a "Save current as…" affordance at the end of the row
- [ ] Applying a Preset writes its five fields onto the Track's Adjustments through the existing update path and is audible immediately, with no reload
- [ ] API tests cover listing, creating, the blank and duplicate name rejections, deleting a user Preset, and the built-in delete rejection; Vitest covers applying a Preset to Adjustments
