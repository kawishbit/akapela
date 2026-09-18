# Self-hosting Akapela

Everything about running Akapela with Docker beyond the three commands in the README.

## Configuring it

Copy `.env.example` to `.env` and edit it:

```
cp .env.example .env
```

- `AKAPELA_PORT` — the host port, `3000` by default.
- `AKAPELA_DATA` — where your library lives. Left unset, it's the named Docker volume `akapela-data`. Set it to a folder on your machine (relative to the compose file, or an absolute path) if you'd rather browse the files yourself.
- `AKAPELA_GENIUS_TOKEN` — optional. With a token from [genius.com/api-clients](https://genius.com/api-clients), Genius joins LRCLIB as a place to look up Lyrics, and it also supplies album art. Leave it unset and Genius just won't be offered.

## Updating

Pull the latest code and rebuild:

```
git pull
docker compose up -d --build
```

`docker compose up -d` on its own reuses the image you already built, so use `--build` whenever you've pulled new code. The database migrates itself on startup.

## Backup and restore

In Settings, **Download backup** gives you an archive of everything that can't be downloaded again: the database, every Track's audio, every Take and Mix. It leaves out the separation model, which downloads again if it's ever missing. **Restore from backup** replaces your entire library with what's in the file and restarts the app.

A backup moves between the Desktop App and a Docker install in either direction. You can also point the Desktop App straight at a folder Docker built, from Settings, and it opens that library as it is.

You can still copy the data folder by hand while the stack is stopped.

## Access

There is no login. Anyone who can reach the port can see your library and everything you've recorded. Akapela is built for a machine on your own network. To reach it from outside, put it behind a reverse proxy with authentication, or a VPN, and let that handle TLS too.

## Hardware

`docker-compose.yml` allots two cores and 2 GB. That's a starting point, not a hard limit; rendering a Mix of a normal-length song takes a couple of seconds within it.

Vocal removal (Separate on a Track) costs more, but only if you use it: a few minutes of CPU per song. It runs one Track at a time. The two Stems it produces add roughly 80 MB per Track on disk. The separation model isn't bundled: the first Separation downloads it into your data folder, where it survives future updates.
