# 16: Put the Take's levels next to the transport, and call them volume

**What to build:** The Review screen already has the control for turning the Backing Track down while listening — `backingGain` — but a singer looking for it does not find it. It is labelled "Backing gain", it sits four controls down inside the "Backing Track" section (ticket 14) between pitch and tempo, and its pair, "Vocal gain", is stranded in a different section under "Your voice". Neither reads as the volume knob it is.

Move both onto the transport, in the Playback section, directly under the seek lanes, and name them "Vocal volume" and "Backing Track volume". They stay the same two controls calling the same `review.setVocalGain` / `review.setBackingGain` — nothing about what they do changes.

This does not break ticket 14's grouping-by-what-it-affects; it follows it. The balance between the two sides is the one control that is not about either side alone, which is exactly the argument ticket 14 made for lifting Reverb and Low-pass out of both groups. What is left behind is genuinely single-sided: "Your voice" keeps the latency nudge, "Backing Track" keeps pitch, Backing Source, and tempo — the things that shape the Backing Track's character rather than its level.

The one thing that must not get lost in the renaming: unlike the Playback volume of ticket 11, these two are saved on the Take and are what the worker renders the Mix with. Say so where they sit.

**Blocked by:** None

**Status:** done

- [x] Vocal and backing level sliders live in the Playback section, under the seek lanes, rather than in the "Your voice" and "Backing Track" sections
- [x] They are labelled "Vocal volume" and "Backing Track volume", with matching `aria-label`s, and read out as a percentage the way they already did
- [x] A line under them says the balance is saved on the Take and is what the Mix is rendered with, so they are not mistaken for the per-device Playback volume of ticket 11
- [x] "Your voice" (now the latency nudge alone) and "Backing Track" (pitch, Backing Source, tempo) keep their headings, with copy that no longer promises a level control
- [x] No change in behavior: the same `review.set*` calls, the same `GAIN_MIN`/`GAIN_MAX` range, the same save path onto the Take

Out of scope: adding a second, separate per-device listening volume to this screen (ticket 11 left it off deliberately, and a second slider next to this one would only be ambiguous), and any change to what `vocalGain`/`backingGain` mean to the worker's render.

## Comments

Raised by the singer directly: "I need to be able to set the volume of
background track in the takes page." The control was already there and already
worked — this ticket is entirely about it not being findable, which is why the
acceptance criteria are labelling and placement and not behavior.

Shipped alongside ticket 15, since both are the Playback section: the levels
now sit under the two seek lanes, separated by a hairline rule, so the section
reads transport → where you are → how loud each side is.
