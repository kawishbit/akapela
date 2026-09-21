# 03: Demo video and "What it does"

**What to build:** A first-time visitor can see and read what Akapela does without leaving the page. The README's demo video (the mp4, not the gif) sits on the page behind a poster frame and downloads nothing until the visitor presses play. Beneath it, the README's five "What it does" points: import, remove the vocals, get lyrics, change pitch and tempo, sing and record.

The video is not re-encoded and not committed a second time: the site's build copies it in from the repo's README assets, which Vercel has because it clones the whole repo. The poster frame is taken from the video once and committed.

**Blocked by:** 01 — Website skeleton, in the Hallmark design

**Status:** done

- [x] The video shows a poster and makes no request for the mp4 until play is pressed
- [x] It plays with controls, inline on phones
- [x] The built site contains the video, copied from the README assets at build time; `site/` in git does not
- [x] The poster is committed, and is small
- [x] The five "What it does" points match the README's meaning, in the Hallmark design from 01
- [x] The video and poster have sensible label text

## Comments
