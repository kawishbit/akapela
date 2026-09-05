# 02: The Worker joins the graph and the Job loop closes

**What to build:** The same one command now starts the Worker alongside the app. Both are pointed at one data directory that the AppHost owns and hands to each of them, so the app and the Worker can no longer disagree about where the database and audio live — today that mismatch shows up only as a Job that silently never runs. A contributor imports a Track in the dashboard-launched app and watches the Job move queued to running to succeeded, with the Worker's logs sitting beside the app's in the dashboard.

**Blocked by:** 01 (AppHost boots the app under one command)

**Status:** ready-for-agent

- [ ] The AppHost declares the Python Worker as a resource, run through uv from the Worker's directory
- [ ] The data directory is modelled once in the AppHost and passed to both the app and the Worker under the environment variable each already reads, with no change to how either resolves it
- [ ] Starting the AppHost brings up app and Worker together; stopping it stops both, leaving no orphaned Worker holding the database
- [ ] Importing an uploaded Track through the dashboard-launched app produces a Job that the Worker picks up and marks succeeded, and the resulting Backing Track plays
- [ ] The dashboard shows the Worker's console output, including per-Job progress, without needing a second terminal
- [ ] The Worker starts after the app so migrations have run, and a Worker restart from the dashboard rejoins the same data directory
- [ ] The Worker's own test command is unaffected and still runs without the AppHost
