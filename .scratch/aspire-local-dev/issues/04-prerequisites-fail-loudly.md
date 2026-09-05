# 04: Prerequisites fail loudly, not mysteriously

**What to build:** A contributor missing `ffmpeg`, `ffprobe`, or Node on the PATH finds out at startup, from a clearly unhealthy Worker in the dashboard naming what is missing, rather than an hour later from a YouTube import that quietly offered fewer formats or a Mix render that died partway. The check runs when the AppHost starts the Worker and costs nothing when the tools are present.

**Blocked by:** 02 (The Worker joins the graph and the Job loop closes)

**Status:** ready-for-agent

- [ ] The Worker reports unhealthy at startup when `ffmpeg` or `ffprobe` is absent, with a message naming the missing tool and how to install it
- [ ] A missing Node runtime is reported the same way, noting that YouTube imports lose formats without it
- [ ] With all prerequisites present the Worker reports healthy promptly and the check adds no noticeable startup delay
- [ ] The check reports rather than aborts: the app stays usable for everything that does not need the missing tool
- [ ] The same check does not fire spuriously inside the Worker container, where the image already provides these tools
