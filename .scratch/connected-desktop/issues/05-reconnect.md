# 05: When the server goes away

**What to build:** The server is on another machine, so it will disappear: a reboot, a sleeping laptop, a moved Wi-Fi network. That must look like Akapela waiting, not like a broken browser.

A shell-rendered screen in the same inline `data:` URL style as the existing states (`main.ts` already has one for "no Akapela server answered"): what happened, which URL it was trying, **Retry**, and **Change server…**. While it is showing, the shell retries on its own at a sensible interval, and loads the app as soon as the server answers — a rebooted server means the singer walks back to a working window rather than a button.

It covers both moments: the server missing at launch, and the server dying mid-session. Ticket 04's version check runs again on a reconnect, since the server may have come back upgraded.

What must not happen: falling back to a local server (ticket 03), a Chromium error page, or a reconnect loop so eager it hammers a server that is mid-boot.

Nothing here is about a Take in progress — if the server vanishes mid-Take that recording is lost, and pretending otherwise would need a buffering story this spec does not have. Say what happened plainly.

**Blocked by:** 01

**Status:** done

- [x] A server that is not answering at launch shows the screen, not a Chromium error
- [x] A server that dies mid-session shows the same screen
- [x] Retry works, and automatic retries continue while the screen is showing, backing off rather than hammering
- [x] A server that comes back is loaded without the singer touching anything
- [x] A server that comes back **upgraded** goes through ticket 04's check
- [x] **Change server…** is reachable from the screen
- [x] No local-server fallback happens at any point
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
