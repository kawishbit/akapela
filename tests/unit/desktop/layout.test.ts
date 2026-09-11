import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  developmentLayout,
  executableName,
  managedYtDlpPath,
  packagedLayout,
  vendorDir,
} from '../../../desktop/src/layout'

describe('executableName', () => {
  it('adds .exe on Windows and nothing anywhere else', () => {
    expect(executableName('ffmpeg', 'win32')).toBe('ffmpeg.exe')
    expect(executableName('ffmpeg', 'darwin')).toBe('ffmpeg')
    expect(executableName('ffmpeg', 'linux')).toBe('ffmpeg')
  })
})

describe('packagedLayout', () => {
  const layout = packagedLayout(join('/Applications', 'Akapela.app', 'Contents', 'Resources'), 'darwin')

  it('points at the server Nitro built, where its public assets sit beside it', () => {
    expect(layout.serverEntry).toContain(join('output', 'server', 'index.mjs'))
  })

  it('ships the migrations, since the database migrates itself on startup', () => {
    expect(layout.migrationsDir).toContain('migrations')
  })

  it('points at the bundled ffmpeg and ffprobe rather than anything on the PATH', () => {
    expect(layout.ffmpeg).toContain(join('bin', 'ffmpeg'))
    expect(layout.ffprobe).toContain(join('bin', 'ffprobe'))
  })

  it('points at the separation CLI compiled to JavaScript, not the TypeScript source', () => {
    expect(layout.separateCli.endsWith('separate-cli.js')).toBe(true)
  })

  it('names the executables for the target platform', () => {
    expect(packagedLayout('C:\\Resources', 'win32').ffmpeg.endsWith('ffmpeg.exe')).toBe(true)
  })
})

describe('developmentLayout', () => {
  // `resolve` puts a drive letter on an absolute path on Windows, so the
  // expectations go through it too rather than assuming a POSIX root.
  const desktopRoot = resolve('/repo', 'desktop')
  const repoRoot = resolve('/repo')
  const layout = developmentLayout(desktopRoot, 'linux', 'x64')

  it('uses what `pnpm build` last produced at the repo root', () => {
    expect(layout.serverEntry).toBe(join(repoRoot, '.output', 'server', 'index.mjs'))
  })

  it('runs the TypeScript separation CLI, the same file compose and `pnpm dev` run', () => {
    expect(layout.separateCli).toBe(join(repoRoot, 'server', 'lib', 'separators', 'separate-cli.ts'))
  })

  it('takes its binaries from the vendor directory the fetch script fills', () => {
    expect(layout.ffmpeg).toBe(join(vendorDir(desktopRoot, 'linux', 'x64'), 'ffmpeg'))
  })
})

describe('managedYtDlpPath', () => {
  it('lives in the library cache, beside the separation model, so it survives app updates', () => {
    expect(managedYtDlpPath('/library', 'linux')).toBe(join('/library', 'cache', 'bin', 'yt-dlp'))
    expect(managedYtDlpPath('C:\\library', 'win32').endsWith('yt-dlp.exe')).toBe(true)
  })
})
