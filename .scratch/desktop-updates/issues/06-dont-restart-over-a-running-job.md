# 06: Don't restart over a running Job

**What to build:** Once an Update has downloaded, **Restart now** is disabled while any Job is running, and a short note says why ("a Job is still running"). It becomes available again when the queue is empty. **Install when I quit** stays available the whole time. That way an Update the singer asked for doesn't quietly throw away a Separation that's minutes in. An ordinary quit is still not guarded, as ADR 0009 says.

**Blocked by:** 05 (Install an Update in place on Windows and Linux)

**Status:** ready-for-agent

- [ ] With a Separation running, **Restart now** is disabled with the note, and **Install when I quit** still works
- [ ] When the Job finishes, **Restart now** becomes available without reopening the prompt
- [ ] With no Job running, **Restart now** is available immediately

## Comments
