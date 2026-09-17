# 07: Tell singers how Updates work now

**What to build:** The README's **Updates** paragraph for the Desktop App describes what happens now. The app asks at launch when there's an Update. On Windows and Linux it installs the Update itself, and on macOS it links to the download until the build is signed. Settings has the automatic-check switch and **Check now**. The Docker section's rebuild instructions stay as they are.

Older installs (v1.0.2 and earlier) have no in-place updater, so they have to install the first Release that includes it by hand. That Release's notes say so in one sentence, and so does the README.

**Blocked by:** 03 (Update controls in Settings), 05 (Install an Update in place on Windows and Linux)

**Status:** done

- [x] The README's **Updates** paragraph matches the behaviour on each platform and mentions the Settings controls
- [x] The README and the first Release's notes say that an older install needs one manual update to get in-place updates
- [x] The Docker update instructions are unchanged

## Comments

Built. The README's **Updates** paragraph covers the prompt, each platform, and the Settings controls. The release workflow now puts the same note above every Release's generated notes, including the one manual update an install from 1.0.2 or older needs — a standing line rather than a one-off, since it stays true for every later Release too.
