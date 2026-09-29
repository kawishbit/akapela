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

## Singing from another device

Browsing your library, importing, and adding to the Queue work from any device on your network. **Recording a Take doesn't**, unless the address is secure. Browsers only give a page the microphone and the audio processing a Take needs on `https://` or on `http://localhost`. So an install reached at `http://192.168.1.20:3000` can be used from the sofa, but only sung on from the server machine itself.

There are three ways round it:

- **A reverse proxy with TLS** in front of Akapela. This is the general answer, and the only one that works for phones and tablets.
- **Tailscale, or a similar VPN**, where the machine gets an `https://` address.
- **The Desktop App, Connected to your server.** On first launch choose **Connect to a server** and type the address, such as `192.168.1.20:3000`. The app makes that one address a secure context, so a laptop can sing with no certificates at all. **Change server…** in its File menu switches later. It doesn't help a phone.

## Hardware

`docker-compose.yml` allots eight cores and 2 GB. That's a starting point, not a hard limit; rendering a Mix of a normal-length song takes a couple of seconds within it.

Vocal removal (Separate on a Track) costs more, but only if you use it: a few minutes of CPU per song. It runs one Track at a time, and by default on every core the container has but one, at lowered priority. Settings > Separation sets the core count. The two Stems it produces add roughly 80 MB per Track on disk as WAV; Settings > Storage can keep new ones as FLAC (about half that) or MP3 (smaller still). Separation Models aren't bundled: the first Separation with each one downloads it into your data folder, where it survives future updates.

## Separating on an NVIDIA GPU

With an NVIDIA card, vocal removal can run on the GPU. It's opt-in, because the image that can do it carries CUDA and cuDNN and is several GB bigger than the default one. The host needs an NVIDIA driver of version 580 or newer (the image runs CUDA 13).

1. Give Docker the GPU:
   - **Linux:** install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) and restart Docker.
   - **Windows:** Docker Desktop on the WSL2 backend, with a current NVIDIA driver installed in Windows. There's nothing to install inside WSL.
2. Start Akapela with the GPU override on top of the usual file:

   ```
   docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
   ```

   Use the same pair of `-f` flags for every later `docker compose` command, updates included.
3. Check it worked: Settings > Separation should say **On this server: … GPU: CUDA**, with a Hardware acceleration switch that's on. A Separation then runs on the GPU. If the GPU fails partway through one, it finishes on the CPU, and its row on the Jobs page says so.

This is NVIDIA only. AMD and Intel GPUs aren't supported in Docker, and Docker on a Mac can't reach the GPU at all. The Desktop App for Apple Silicon is the way to separate on a Mac's GPU. If the switch doesn't appear, see [Troubleshooting](troubleshooting.md#the-gpu-override-wont-start-or-settings-shows-no-gpu).
