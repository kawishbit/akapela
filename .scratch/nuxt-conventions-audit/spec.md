# Spec: Nuxt directory-structure and conventions audit

Status: done

## Issues

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Close the specific structural gaps](issues/01-close-structural-gaps.md) | done | — |
| 02 | [Implementation-level pass over app/](issues/02-implementation-pass.md) | done | — |

## Problem Statement

The user wanted Nuxt best practices applied "from the folder structure to the implementation," pointing at the official directory-structure and getting-started docs.

## Findings

`app/` already uses Nuxt 4's default `srcDir` convention, alongside a top-level `shared/` and a conventional `server/` — i.e. the app already matches the linked docs. A grilling session (see project chat) settled the scope down from "restructure" to "audit," given there was nothing structural actually wrong. Two things were genuinely absent and worth closing (ticket 01); everything else — the custom `audio/` domain folder, flat `components/`/`composables/` at 10-12 files, no `layouts/`/`middleware/` — was deliberately left alone as not broken.
