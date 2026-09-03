# 10: Settings page, compose documentation, and device pass

**What to build:** A singer opens a Settings page to set the default Lyrics Provider, the microphone processing default, and the Monitoring default. A self-hoster reads a short README and a commented compose file that explain the port, the data volume as either a named volume or a bind mount, the environment variables including the optional Genius token, and recommended CPU and memory limits for the worker. Every page is checked on phone portrait and laptop widescreen with thumb-sized controls and nothing hidden.

**Blocked by:** 06 (Genius and Manual Lyrics Providers), 07 (Record a Take)

**Status:** ready-for-agent

- [ ] A Settings page reads and writes the default Lyrics Provider, microphone processing default, and Monitoring default, stored in the database and applied by the Track and Sing pages
- [ ] The compose file documents the port, named versus bind-mounted data volume, all environment variables, and recommended resource limits for the app and worker
- [ ] A README covers the one-command quick start, where data lives, that backups are the self-hoster's job, how to get a Genius token, and what to do when yt-dlp breaks
- [ ] Library, Track detail, Sing, Review, and Settings pages are checked on phone portrait and laptop widescreen; every control is reachable and thumb-sized, and the Lyrics screen stays jank-free
- [ ] API tests cover reading and writing settings
