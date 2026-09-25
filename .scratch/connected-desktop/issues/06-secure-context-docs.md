# 06: Singing needs a secure context (docs)

**What to build:** Write down a limit that has always been true and appears nowhere a self-hoster would look.

`docs/self-hosting.md` should say, in the plainest terms: browsing the Library, importing, and queueing work from any device on the network, but **recording a Take needs a secure context**, because browsers only give a page a microphone and an AudioWorklet on `https://` or on `http://localhost`. So a compose install reached at `http://192.168.1.20:3000` can be used from the sofa but only sung on from the server machine — until one of these:

- **A reverse proxy with TLS** (the general answer, and the only one for phones).
- **Tailscale or similar**, where the hostname is HTTPS.
- **The Connected Desktop App** (this spec), which is the no-certificates route for a laptop.

Keep it short and in the voice of the existing docs: what happens, why, and the three ways out. `docs/troubleshooting.md` gets the symptom-side entry — "the Sing screen says it cannot reach my microphone" — pointing here, since that is where someone lands when it fails rather than before.

Do not oversell the Connected App: phones are not fixed by it.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] `docs/self-hosting.md` states the secure-context limit and names the three ways round it
- [ ] `docs/troubleshooting.md` has the symptom entry pointing at it
- [ ] The wording does not promise that the Connected Desktop App helps phones
- [ ] No claim is made about HTTPS setup beyond pointing at a reverse proxy
- [ ] Links resolve; the README stays unchanged (it is deliberately short)

## Comments
