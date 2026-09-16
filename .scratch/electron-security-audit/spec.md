# Spec: Electron preventive security/lifecycle audit

Status: done

## Issues

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Specific-item hardening pass](issues/01-specific-item-pass.md) | done | — |

## Problem Statement

The user wanted Electron best practices applied "from folder structure to implementation," referencing general Electron-architecture and performance guides.

## Findings

`desktop/` already had `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a `contextBridge` preload exposing only named, typed operations (no generic `invoke`/`send`), `setWindowOpenHandler` + `will-navigate` blocking arbitrary navigation, a `setPermissionRequestHandler` restricted to `media`, and a main process already split into ~12 single-responsibility modules (ADR 0009's "thin shell" already produces most of what these guides recommend). There is no local renderer bundle — the window points at the same HTTP server compose runs — so the `main/preload/renderer` folder split those guides describe doesn't apply here; nothing to restructure. Treated as a preventive audit rather than a restructure, per the grilling session in project chat.
