# 02: The secure-context grant

**What to build:** The thing a browser cannot do, and the reason this feature exists: make the remote origin a secure context so recording a Take works.

`getUserMedia` and the AudioWorklet engines need a secure context (ADR 0009 says so already). `http://localhost` qualifies; `http://192.168.1.20:3000` does not. When Connected over plain HTTP, the shell grants secure-context status to **exactly** the origin the singer entered, via `--unsafely-treat-insecure-origin-as-secure` (with whatever companion switch Chromium currently requires for it to take effect), applied before `app.whenReady()`.

Rules:

- Scoped to one origin. Never a wildcard, never a second host, never applied in **Use this computer** mode.
- Skipped entirely when the stored URL is `https://`, which needs no grant.
- The origin string is derived from the same normalisation ticket 01 built, so what is granted and what is loaded cannot drift apart.

Write the **ADR amending 0009**: the shell no longer always wraps a server it started, and a flag with "unsafely" in its name needs its reasoning recorded — what it buys (singing from a second machine with no TLS setup), what it costs (that origin is treated as trusted by Chromium, in a window that loads nothing else), and the alternatives rejected (a privileged `akapela://` scheme, requiring HTTPS).

Verify it end to end against a real second machine: import, sing a Take with monitoring, and render a Mix.

**Blocked by:** 01

**Status:** ready-for-human

- [ ] Connected over `http://` to a LAN address, recording a Take works: the mic prompt appears and the AudioWorklet engines start
- [x] The grant names exactly the one origin; no wildcard and no second host
- [ ] An `https://` server gets no grant and still works
- [x] **Use this computer** mode passes no such switch at all
- [x] The granted origin is derived from ticket 01's normalisation, with a test proving they agree
- [ ] Monitoring, latency compensation, and a Mix all work Connected, not just playback
- [x] An ADR amends 0009 with the reasoning, the cost, and the rejected alternatives
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

The grant is built: `desktop/src/connection.ts` (`secureContextGrant`, covered in `tests/unit/desktop/connection.test.ts`) and the switch in `desktop/src/main.ts`, applied before `app.whenReady()`. ADR 0015 amends 0009.

What is left needs a person and a second machine, which an agent session does not have. Connected over `http://` to a LAN address, check that the microphone prompt appears and a Take records with monitoring on, that the latency nudge and a Mix work, and that an `https://` server works with no grant. If Chromium ignores the switch, `--user-data-dir` is the companion that desktop Chrome needs, and it is worth trying there first.
