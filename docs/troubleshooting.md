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
