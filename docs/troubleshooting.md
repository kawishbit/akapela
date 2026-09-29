# Troubleshooting

## YouTube imports stopped working

Akapela fetches YouTube audio with [yt-dlp](https://github.com/yt-dlp/yt-dlp). YouTube changes its site without warning, so an import that worked last month can suddenly fail. An updated yt-dlp has almost always already shipped.

- **Desktop App:** open Settings and press **Update yt-dlp**.
- **Docker:** yt-dlp is baked into the image, so rebuild:

  ```
  git pull
  docker compose up -d --build
  ```

If that gets you nothing newer, the breakage is probably too fresh for a fix. Check [yt-dlp's issue tracker](https://github.com/yt-dlp/yt-dlp/issues) and try again once a fix lands. Importing an audio file is unaffected either way.

## A Spotify playlist won't open

**"Akapela couldn't read that page from Spotify."** Akapela reads a playlist from Spotify's public embed page, with no login. That page is unofficial, and Spotify can change it without warning, the way YouTube changes under yt-dlp. When it does, Akapela needs updating to read the new page:

- **Desktop App:** install the latest Update (Settings, under About).
- **Docker:** pull and rebuild:

  ```
  git pull
  docker compose up -d --build
  ```

If you're already on the latest version, the change is probably too new for a fix. Import the songs from YouTube one at a time until one lands.

**"That has 150 songs."** A Playlist Import takes up to 100 songs, from a playlist or an album, because Spotify's embed page lists no more than that. Make a shorter playlist from it in Spotify, and paste that link.

**"Spotify has no public playlist or album at that link."** The playlist is private or has been deleted. Make it public in Spotify, or paste a link to a copy that is.

## A song from a playlist found nothing on YouTube

**"Akapela couldn't find … on YouTube."** For each song, Akapela searches YouTube for "artist - title". It takes the first result whose length is within 10 seconds of the length Spotify gives. When nothing is that close, the import fails rather than guessing. Find the song on YouTube yourself, then paste its link into the field on the Track's card or its page. The import runs again from that link, then fetches the song's Lyrics and separates it, like the rest of the playlist.

## The GPU override won't start, or Settings shows no GPU

If `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up` stops with an error like `could not select device driver "nvidia" with capabilities: [[gpu]]`, Docker can't see the GPU. On Linux, install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) and restart Docker. On Windows, use Docker Desktop's WSL2 backend with a current NVIDIA driver. Check with:

```
docker run --rm --gpus all ubuntu nvidia-smi
```

If that lists your card but Settings still says **no GPU found**, either the container started without the GPU image, or the host's driver is too old for CUDA 13. `nvidia-smi` on the host should show driver 580 or newer. Make sure both `-f` files are on the command, and rebuild with `--build`. Either way, vocal removal still works on the CPU.

## The Sing screen can't reach my microphone

If Akapela is open at an address like `http://192.168.1.20:3000`, the browser won't give it a microphone: recording needs `https://` or `http://localhost`. See [Singing from another device](self-hosting.md#singing-from-another-device) for the three ways round it. Browsing, importing, and queueing work either way.

## macOS says Akapela can't be verified

The app isn't notarized by Apple yet. The first time you open it, macOS says **Apple could not verify "Akapela" is free of malware**. Choose **Done**, then:

1. Open **System Settings → Privacy & Security** and scroll to **Security**. It says **"Akapela" was blocked to protect your Mac**.
2. Choose **Open Anyway**, then **Open Anyway** again, and confirm with your password or Touch ID.

This happens once. On macOS 15 and later, right-click → **Open** no longer gets past it; Privacy & Security is the only route.

## Windows says it protected your PC

The installer isn't signed yet. On the blue SmartScreen box, choose **More info**, then **Run anyway**. This happens once.

## Updates in the Desktop App

The app checks for a newer release when it starts and asks whether you want it. It never asks mid-song: on the Sing or Take screen, the question waits until you leave.

- **Windows and Linux AppImage:** saying yes downloads and installs the update. A restart waits while a Job is still running.
- **macOS:** saying yes opens the download page, because macOS won't update an unsigned app in place.

Settings has **Check on launch** (on by default; turned off, Akapela never contacts GitHub on its own) and **Check now**. If you're on **1.0.2 or older**, install the first release that has this by hand, once.
