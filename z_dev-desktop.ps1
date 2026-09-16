#requires -Version 7.0
<#
.SYNOPSIS
  Runs the Akapela desktop app against a live, hot-reloading dev server —
  the two-terminal loop from CLAUDE.md/README.md, collapsed into one.

.DESCRIPTION
  Starts `pnpm dev` (the root Nuxt app) in the background, waits for it to
  report which port it actually bound to (it shifts if something else
  already holds 3000), then runs the desktop shell in the foreground with
  `AKAPELA_SERVER_URL` pointed at it. Hot reload on the Nuxt side still
  works exactly as it does in the two-terminal version.

  Closing the desktop window (or Ctrl+C) stops the background dev server
  too, so nothing is left running behind you.

.PARAMETER SkipInstall
  Skip `pnpm install` in desktop/ before starting it. Useful once you know
  it's already up to date — the script otherwise always runs it, since it's
  a fast no-op when nothing changed.

.PARAMETER TimeoutSeconds
  How long to wait for the dev server to report its port before giving up.
#>
[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$desktopDir = Join-Path $repoRoot 'desktop'
$stamp = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$outLog = Join-Path ([System.IO.Path]::GetTempPath()) "akapela-dev-server-$stamp.out.log"
$errLog = Join-Path ([System.IO.Path]::GetTempPath()) "akapela-dev-server-$stamp.err.log"

$devProcess = $null

function Stop-DevServer {
  if ($devProcess -and -not $devProcess.HasExited) {
    Write-Host "Stopping the dev server (pid $($devProcess.Id))..." -ForegroundColor Cyan
    # `pnpm dev` is really `cmd.exe -> pnpm.cmd -> node`; killing just the top
    # pid leaves node running. /T takes the whole tree with it.
    & taskkill /T /F /PID $devProcess.Id *> $null
  }
  Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue
}

try {
  Write-Host "Starting the Nuxt dev server..." -ForegroundColor Cyan
  $devProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'pnpm dev' `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -NoNewWindow -PassThru

  $port = $null
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $outLog) {
      $content = Get-Content $outLog -Raw -ErrorAction SilentlyContinue
      if ($content -match 'localhost:(\d+)') {
        $port = $Matches[1]
        break
      }
    }
    if ($devProcess.HasExited) {
      Get-Content $outLog, $errLog -ErrorAction SilentlyContinue | Write-Host
      throw 'The dev server exited before it started listening — see the output above.'
    }
    Start-Sleep -Milliseconds 300
  }

  if (-not $port) {
    throw "Timed out after $TimeoutSeconds seconds waiting for the dev server to report its port. Check $outLog."
  }

  Write-Host "Dev server is up on http://localhost:$port" -ForegroundColor Green

  Push-Location $desktopDir
  try {
    if (-not $SkipInstall) {
      pnpm install
    }
    $env:AKAPELA_SERVER_URL = "http://localhost:$port"
    pnpm run dev
  }
  finally {
    Pop-Location
  }
}
finally {
  Stop-DevServer
}
