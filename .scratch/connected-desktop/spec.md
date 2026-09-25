# Spec: Connect the Desktop App to your server

Status: ready-for-agent

`ROADMAP.md`, item 3. Capitalised terms (Desktop App, Connected, Release, Update, Take) are defined in `CONTEXT.md`.

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Choosing where Akapela comes from](issues/01-choosing-a-server.md) | done | — |
| 02 | [The secure-context grant](issues/02-secure-context-grant.md) | ready-for-human | 01 |
| 03 | [Connected starts nothing locally](issues/03-connected-starts-nothing.md) | done | 01 |
| 04 | [Version skew](issues/04-version-skew.md) | done | 01 |
| 05 | [When the server goes away](issues/05-reconnect.md) | done | 01 |
| 06 | [Singing needs a secure context (docs)](issues/06-secure-context-docs.md) | done | — |

06 documents what is already true and can land immediately. 01 gates the rest.

## Problem Statement

The Desktop App starts its own server and owns its own data directory (ADR 0009). A household already running Akapela under compose has no way to point a laptop at it, so a second machine means a second, disconnected library — the songs, Takes, and Mixes in the wrong place, and the Queue (item 2) split in two.

It is worse than an inconvenience. Singing needs `getUserMedia` and an AudioWorklet, both of which require a **secure context**. `http://localhost` is one; `http://192.168.1.20:3000` is not. ADR 0009 already names this as the reason the shell loads `http://` rather than `file://`. So today a compose install can be browsed, imported to, and queued from any device in the house, but can only be *sung* on the server machine itself — unless the self-hoster terminates TLS in front of it. That limit is documented nowhere.

## Solution

The Desktop App can be **Connected**: pointed at an Akapela running elsewhere instead of the one it would start itself. It is the attached-server path `AKAPELA_SERVER_URL` already provides for development, promoted to a stored setting — plus the one thing a browser cannot do, granting that origin secure-context status, which is what makes singing work at all.

## Decisions

- **The choice is made once, on first launch:** **Use this computer** or **Connect to a server**, with a URL field and a connection test. Changeable later from the shell's menu, with a restart. Stored in the existing config store beside the window bounds.
- **Not "always local, with a connect option".** Starting a local server on a machine that only ever wanted to be a client creates a second empty library to be confused by.
- **The secure-context grant is `--unsafely-treat-insecure-origin-as-secure`, scoped to exactly the origin the singer entered**, and skipped when that origin is already `https://`. A custom privileged scheme (`akapela://`) is cleaner on paper but rewrites every URL the app produces and would bite the audio and download paths. Requiring HTTPS hands the problem back to the self-hoster, which is the thing worth avoiding. This is what the ADR is for: a flag with "unsafely" in its name needs its reasoning written down where the next person will find it.
- **Connected starts nothing of its own:** no data directory, no resolved binaries, no spawned server. No local fallback — silently swapping in a different, empty library is the worst failure mode available. If the server cannot be reached, say so.
- **Version skew is refused in one direction.** The whole UI comes from the server while the title bar, the IPC bridge (`preload.cts`), and the update check stay local, so a server **newer** than the shell can expect a bridge method the shell lacks: refuse with a clear message and offer the Update. An older server is the safe direction and says nothing.
- **Any URL is accepted.** Akapela has no accounts; refusing public addresses would break Tailscale and every legitimate reverse proxy, and would imply a security model the app does not have. The connect screen and the docs say in words that it belongs on a LAN or behind a VPN.
- **`AKAPELA_SERVER_URL` still wins** when set, so the contributor loop in `CLAUDE.md` is untouched by any of this.
- **The docs gap is part of this work**, not a follow-up: `docs/self-hosting.md` has never said that singing needs a secure context.
- **An ADR amends 0009.** The shell no longer always wraps a server it started, and the grant needs its reasoning recorded.

## Out of scope

- Any authentication, user accounts, or per-device identity.
- Discovering servers on the network (mDNS/Bonjour). Typing a URL is enough, and the docs can suggest a hostname.
- Remembering several servers, or switching between them without a restart.
- A phone fix. A PWA has no such escape hatch: singing from a phone still needs HTTPS. Adding to the Queue from a phone needs no microphone and already works.
- Offline or partial operation while the server is unreachable.
