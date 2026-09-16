#requires -Version 7.0
<#
.SYNOPSIS
  Runs `pnpm install` in every location this repo needs it.

.DESCRIPTION
  There is no pnpm workspace here on purpose (see CLAUDE.md / ADR 0009):
  `apphost/` and `desktop/` each carry a several-hundred-megabyte,
  development-only dependency tree (Aspire's CLI tooling, Electron) that the
  root install — the one the Dockerfile runs — must never see. That means
  three independent `pnpm install`s instead of one, which is easy to forget
  after a fresh clone or a lockfile change. This script just runs all three,
  in the repo root, then `apphost/`, then `desktop/`.

.PARAMETER SkipDesktop
  Skip the `desktop/` install. Useful if you don't have the Electron
  toolchain set up and only need the app and/or AppHost.

.PARAMETER SkipApphost
  Skip the `apphost/` install. Useful if you're not using `aspire run` and
  only need the app and/or desktop shell.
#>
[CmdletBinding()]
param(
  [switch]$SkipDesktop,
  [switch]$SkipApphost
)

$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot

function Install-In {
  param([string]$Label, [string]$Dir)

  Write-Host "==> pnpm install ($Label)" -ForegroundColor Cyan
  Push-Location $Dir
  try {
    pnpm install
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm install failed in $Dir (exit code $LASTEXITCODE)"
    }
  }
  finally {
    Pop-Location
  }
}

Install-In -Label 'root' -Dir $repoRoot

if (-not $SkipApphost) {
  Install-In -Label 'apphost/' -Dir (Join-Path $repoRoot 'apphost')
}
else {
  Write-Host "==> Skipping apphost/ (-SkipApphost)" -ForegroundColor DarkGray
}

if (-not $SkipDesktop) {
  Install-In -Label 'desktop/' -Dir (Join-Path $repoRoot 'desktop')
}
else {
  Write-Host "==> Skipping desktop/ (-SkipDesktop)" -ForegroundColor DarkGray
}

Write-Host "All installs complete." -ForegroundColor Green
