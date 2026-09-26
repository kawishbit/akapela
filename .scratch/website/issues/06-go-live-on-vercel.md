# 06: Go live on Vercel

**What to build:** The Website is reachable at `https://akapela.kawishbit.com`. Only the maintainer can do this: it needs their Vercel and DNS accounts.

1. In Vercel, import `kawishbit/akapela` as a new project.
2. Set **Root Directory** to `site/`. Leave "Include files outside the root directory in the Build Step" on — ticket 03's build copies the demo video from the README assets.
3. Framework preset: Astro. No environment variables are needed.
4. Add the domain `akapela.kawishbit.com` to the project and create the DNS record Vercel asks for (a `CNAME` to Vercel) at the provider for `kawishbit.com`.
5. Leave the production branch as `main`. Every push to `main` redeploys; that is expected.

**Blocked by:** 01 — Website skeleton, in the Hallmark design

**Status:** ready-for-human

- [ ] The Vercel project builds from `site/` on pushes to `main`
- [ ] `https://akapela.kawishbit.com` serves the page over HTTPS
- [ ] The project has no environment variables or secrets

## Comments
