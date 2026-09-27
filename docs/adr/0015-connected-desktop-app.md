# A Connected Desktop App, and the secure-context grant it needs

_Amends ADR 0009. See `ROADMAP.md`, Done, and `.scratch/connected-desktop/`._

ADR 0009 made the Desktop App a window over a server it starts itself, on loopback. That stays the default. What changes is that the shell no longer *always* wraps a server of its own: it can be **Connected**, pointed at an Akapela already running elsewhere — typically a compose install on the household server — and then it starts nothing. No server, no port, no data directory, no bundled binaries. It is a window, a title bar, the preload bridge, and the shell's own update check. First launch asks which (**Use this computer** or **Connect to a server**), and **Change server…** in the File menu asks again.

The reason this is more than a convenience is singing. Recording a Take needs `getUserMedia` and an AudioWorklet, and Chromium gives both only to a secure context: `https://`, or loopback. ADR 0009's own server is on `127.0.0.1`, which is why it never came up. A compose install reached at `http://192.168.1.20:3000` is neither, so from a browser it can be browsed, imported to, and queued, but only sung on from the server machine itself. A browser cannot change that. A Desktop App can.

## Decision

When Connected over plain `http://`, the shell starts Chromium with `--unsafely-treat-insecure-origin-as-secure=<origin>`, naming **exactly** the origin the singer entered. It is set before `app.whenReady()`, because a switch only counts from startup — which is why changing server restarts the app rather than switching in place.

The origin comes from the same normalisation that produces the URL the window loads (`desktop/src/connection.ts`), so what is granted and what is loaded cannot drift apart. The grant is never a wildcard or a second host, and it is never applied to an `https://` server (which needs nothing), to **Use this computer** (already loopback), or to the contributor loop's `AKAPELA_SERVER_URL`.

A flag with "unsafely" in its name needs its reasoning written down, so:

- **What it buys:** singing from a second machine in the house with no TLS setup at all. That is the whole feature; without it, Connected would be a browser with a title bar.
- **What it costs:** Chromium treats that one origin as trusted. It gets powerful features a page from that address could not otherwise have: the microphone, AudioWorklets, anything else gated on a secure context. The traffic is still plain HTTP, readable by anyone on the path. That is acceptable here because the window loads nothing but that origin (`will-navigate` sends every other address to the singer's browser), and because Akapela has no accounts and no secrets to protect in transit. Anyone who can reach the server can already use it. The connect screen and `docs/self-hosting.md` say plainly that it belongs on a LAN or behind a VPN.

## Considered

- **A privileged custom scheme (`akapela://`).** Cleaner on paper: register it as secure and proxy it to the server. Rejected because every URL the app produces — covers, Backing Track streams with `Range` requests, Mix downloads, the API — would have to be rewritten or proxied. Range-request seeking is exactly what ADR 0009 kept HTTP for.
- **Requiring HTTPS.** Correct, and still the only answer for phones. Rejected as the *only* way, because it hands the whole problem back to the self-hoster, which is the thing this feature exists to avoid. An `https://` server works Connected with no grant at all.
- **Always local, with a connect option.** Rejected: starting a local server on a machine that only ever wanted to be a client creates a second, empty library to be confused by.

## Consequences

- **No local fallback, ever.** If the server cannot be reached, the window shows a waiting screen that keeps retrying, backing off to every thirty seconds, and loads the app the moment the server answers. Silently swapping in this computer's own library would put the singer in front of a different, empty library, which is the worst failure available.
- **Version skew is refused in one direction.** Connected, the UI comes from the server while the bridge stays in the shell, so a server **newer** than the shell may call a bridge method this shell lacks. That is refused, naming both versions and offering the Update. An older server can only ask for what already existed, so it loads silently. The server says which Release it is at `GET /api/version`.
- **The library lives on the server.** Connected, the bridge reports no local library folder, so Settings leaves that section out and the File menu has no library items.
- **An install from before this choice existed is not asked.** A remembered port means its own server has run there before, so it stays on this computer.
- **Verified by hand, not by the suite.** The grant only exists inside a real Chromium talking to a real second machine, so checking it is a manual step. Everything that decides it — normalisation, mode, which origin, version order, backoff — is a plain function in the root vitest suite.
