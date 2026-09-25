# 01: Choosing where Akapela comes from

**What to build:** The choice, stored, with the screens around it. No behaviour change yet for a singer who picks **Use this computer** — that path stays exactly what it is today.

On first launch, before any server is started, the shell asks once:

- **Use this computer** — what the Desktop App does today.
- **Connect to a server** — a URL field ("http://192.168.1.20:3000"), a **Test connection** button, and one line saying Akapela has no accounts, so a server should be on your own network or behind a VPN.

The chosen mode and URL live in the config store (`desktop/src/config.ts`), beside the window bounds. A menu item — **Change server…** — reopens the choice and restarts into it. `AKAPELA_SERVER_URL` still wins over the stored value when set, so the contributor loop in `CLAUDE.md` is untouched.

The connection test asks the candidate server for something cheap that proves it is an Akapela and not a random web server, and reports a URL that isn't one, a host that doesn't answer, and a URL that doesn't parse as three different messages rather than one shrug.

Keep the logic testable the way the rest of the shell is: URL normalisation (a bare host becomes `http://host`, a trailing slash is dropped, a bogus string is refused) and the mode decision belong in plain functions with no Electron import, covered by the **root** vitest suite in `tests/unit/desktop/`. The screens themselves are shell-rendered, in the inline `data:` URL style the splash and error states already use.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] First launch asks once; the answer is remembered and not asked again
- [ ] **Use this computer** behaves exactly as today, including its data directory and port handling
- [ ] **Connect to a server** stores the URL and opens the window on it
- [ ] The URL field accepts `192.168.1.20:3000`, `http://host:3000`, and `https://karaoke.example` and normalises them
- [ ] Test connection distinguishes: not an Akapela, host unreachable, unparseable URL
- [ ] **Change server…** in the menu reopens the choice and restarts into the new mode
- [ ] `AKAPELA_SERVER_URL` overrides the stored setting
- [ ] The connect screen states that Akapela has no accounts, in one line
- [ ] Normalisation and mode selection are plain functions covered by `tests/unit/desktop/`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass at the root; `desktop/` lints and typechecks from inside itself

## Comments
