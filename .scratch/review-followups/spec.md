# Review follow-ups: Jobs page, Queue, Connected Desktop

Status: needs-triage

Found by the code review of the Jobs page, Queue, and Connected Desktop work (`e9185a5..8a69593` on `feature/website`) and left for later on purpose. None of them blocks anything shipped. Each is either a narrow timing window or a judgement call about behaviour. Capitalised terms are defined in `CONTEXT.md`.

## Issues

| # | Ticket | Status | Kind |
| - | ------ | ------ | ---- |
| 01 | [A late cancel can still replace a Track's Stems](issues/01-late-cancel-replaces-stems.md) | needs-triage | race |
| 02 | [A cancel just as a Job finishes undoes finished work](issues/02-cancel-after-finish-undoes-work.md) | needs-triage | race |
| 03 | [A tab closed before the Queue loads strands its entry](issues/03-closed-tab-strands-entry.md) | needs-triage | edge case |
| 04 | [Up next after a plain Sing visit](issues/04-up-next-after-plain-sing.md) | needs-triage | behaviour decision |
| 05 | [Sing over the original changes the Track for good](issues/05-sing-over-original-is-sticky.md) | needs-triage | behaviour decision |
| 06 | [Repeated checks and messages in the Queue and Job routes](issues/06-repeated-route-checks.md) | needs-triage | tidy-up |

01 and 02 are the two worth doing first: each can leave a Job row saying `cancelled` while the thing it names says otherwise.
