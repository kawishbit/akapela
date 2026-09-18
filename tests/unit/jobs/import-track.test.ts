import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { importHandler } from '../../../server/lib/jobs/import-track'
import { BACKING_TRACK_FILE, trackDir } from '../../../server/lib/jobs/track-paths'
import type { JobContext } from '../../../server/lib/jobs-runner'
import { SourceError, YtDlpFetcher, type MetadataOptions, type ProgressCallback, type SourceFetcher, type SourceMetadata } from '../../../server/lib/sources'
import { probe, writeSineMp3 } from '../audio-fixtures'
import { createJobTestDb, type JobTestDb } from '../job-test-db'

const TRACK_ID = 't1'

let db: JobTestDb | undefined

afterEach(() => {
  db?.close()
  db = undefined
})

function setup(): JobTestDb {
  db = createJobTestDb()
  return db
}

function insertTrack(t: JobTestDb, options: { sourceKind: 'upload' | 'youtube', sourceRef: string, title?: string }): void {
  t.akapela.sqlite
    .prepare(
      `INSERT INTO tracks (id, title, artist, duration_ms, cover_path, source_kind, source_ref,
        import_state, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, 'cover.svg', ?, ?, 'importing', 1000, 1000)`,
    )
    .run(TRACK_ID, options.title ?? 'Sine', options.sourceKind, options.sourceRef)
}

function getTrack(t: JobTestDb): Record<string, unknown> {
  return t.akapela.sqlite.prepare(`SELECT * FROM tracks WHERE id = ?`).get(TRACK_ID) as Record<string, unknown>
}

/** A JobContext built by hand, so a test can hook into progress reporting directly. */
function buildCtx(t: JobTestDb, jobId: string, onProgress?: (percent: number) => void): JobContext {
  t.akapela.sqlite
    .prepare(`INSERT INTO jobs (id, type, target_id, state, progress, error, created_at) VALUES (?, 'import', ?, 'running', 0, NULL, 1000)`)
    .run(jobId, TRACK_ID)
  return {
    job: {
      id: jobId,
      type: 'import',
      targetId: TRACK_ID,
      state: 'running',
      progress: 0,
      error: null,
      createdAt: 1000,
      startedAt: 1000,
      finishedAt: null,
      traceParent: null,
    },
    dataDir: t.dataDir,
    sqlite: t.akapela.sqlite,
    progress(percent) {
      t.akapela.sqlite.prepare(`UPDATE jobs SET progress = ? WHERE id = ?`).run(percent, jobId)
      onProgress?.(percent)
    },
  }
}

class FakeFetcher implements SourceFetcher {
  downloadCalls = 0
  constructor(
    private readonly options: {
      metadata?: SourceMetadata
      metadataError?: string
      downloadError?: string
      onDownload?: () => void
      coverBytes?: Uint8Array
    } = {},
  ) {}

  metadataOptions: MetadataOptions | undefined

  async fetchMetadata(_url: string, directory: string, options?: MetadataOptions): Promise<SourceMetadata> {
    this.metadataOptions = options
    if (this.options.metadataError) throw new SourceError(this.options.metadataError)
    const metadata = options?.keepCover ? { ...this.options.metadata!, coverFile: null } : this.options.metadata!
    if (metadata.coverFile) {
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, metadata.coverFile), this.options.coverBytes ?? new Uint8Array([1, 2, 3]))
    }
    return metadata
  }

  async downloadAudio(_url: string, directory: string, onProgress: ProgressCallback): Promise<string> {
    this.downloadCalls += 1
    this.options.onDownload?.()
    if (this.options.downloadError) throw new SourceError(this.options.downloadError)
    onProgress(0.5)
    onProgress(1.0)
    const original = join(directory, 'original.mp3')
    writeSineMp3(original, { seconds: 2 })
    return original
  }
}

describe('importHandler (upload)', () => {
  it('produces a Backing Track WAV and marks the Track ready', async () => {
    const t = setup()
    const directory = trackDir(t.dataDir, TRACK_ID)
    writeSineMp3(join(directory, 'original.mp3'), { seconds: 2 })
    insertTrack(t, { sourceKind: 'upload', sourceRef: 'sine.mp3' })
    const ctx = buildCtx(t, 'j1')

    await importHandler(new YtDlpFetcher())(ctx)

    const backing = join(directory, BACKING_TRACK_FILE)
    expect(existsSync(backing)).toBe(true)
    const info = probe(backing)
    expect(info.streams[0]!.codec_name).toBe('pcm_s16le')
    expect(info.streams[0]!.sample_rate).toBe('44100')
    expect(info.streams[0]!.channels).toBe(2)
    expect(Math.abs(Number(info.format.duration) - 2)).toBeLessThan(0.15)

    const track = getTrack(t)
    expect(track.import_state).toBe('ready')
    expect(Math.abs((track.duration_ms as number) - 2000)).toBeLessThan(150)
    expect(existsSync(join(directory, 'original.mp3'))).toBe(true)
  })

  // Every format an upload accepts, plus the AAC and Opus yt-dlp's
  // `bestaudio` hands back. The Track's duration comes from the Backing
  // Track's WAV header rather than ffprobe, so each has to land on it too.
  it.each([
    { extension: 'mp3', codec: 'libmp3lame' },
    { extension: 'm4a', codec: 'aac' },
    { extension: 'wav', codec: 'pcm_s16le' },
    { extension: 'flac', codec: 'flac' },
    { extension: 'ogg', codec: 'libvorbis' },
    { extension: 'webm', codec: 'libopus' },
  ])('imports a $extension ($codec) upload with its duration', async ({ extension, codec }) => {
    const t = setup()
    const directory = trackDir(t.dataDir, TRACK_ID)
    mkdirSync(directory, { recursive: true })
    const encoded = spawnSync('ffmpeg', [
      '-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-ar', '48000', '-ac', '2', '-c:a', codec, join(directory, `original.${extension}`),
    ])
    expect(encoded.status, encoded.stderr.toString()).toBe(0)
    insertTrack(t, { sourceKind: 'upload', sourceRef: `sine.${extension}` })

    await importHandler(new YtDlpFetcher())(buildCtx(t, 'j1'))

    const track = getTrack(t)
    expect(track.import_state).toBe('ready')
    expect(Math.abs((track.duration_ms as number) - 3000)).toBeLessThan(100)
  })

  it('records the ffmpeg error and fails the Track on a corrupt original', async () => {
    const t = setup()
    const directory = trackDir(t.dataDir, TRACK_ID)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'original.mp3'), 'this is not audio at all, '.repeat(200))
    insertTrack(t, { sourceKind: 'upload', sourceRef: 'broken.mp3' })
    const ctx = buildCtx(t, 'j1')

    await expect(importHandler(new YtDlpFetcher())(ctx)).rejects.toThrow(/ffmpeg/i)

    expect(getTrack(t).import_state).toBe('failed')
    expect(existsSync(join(directory, BACKING_TRACK_FILE))).toBe(false)
  })

  it('fails the job when the Track no longer exists', async () => {
    const t = setup()
    // No Track inserted at all — the row this job targets does not exist.
    const ctx = buildCtx(t, 'j1')

    await expect(importHandler(new YtDlpFetcher())(ctx)).rejects.toThrow(TRACK_ID)
  })

  it.each([
    { label: 'before ffmpeg', deleteAt: 10 },
    { label: 'after ffmpeg', deleteAt: 80 },
  ])('leaves no orphan directory when the Track is deleted during import ($label)', async ({ deleteAt }) => {
    const t = setup()
    const directory = trackDir(t.dataDir, TRACK_ID)
    writeSineMp3(join(directory, 'original.mp3'), { seconds: 1 })
    insertTrack(t, { sourceKind: 'upload', sourceRef: 'sine.mp3' })
    const ctx = buildCtx(t, 'j1', (percent) => {
      if (percent === deleteAt) {
        t.akapela.sqlite.prepare(`DELETE FROM tracks WHERE id = ?`).run(TRACK_ID)
        rmSync(directory, { recursive: true, force: true })
      }
    })

    await expect(importHandler(new YtDlpFetcher())(ctx)).rejects.toThrow(/deleted/)
    expect(existsSync(directory)).toBe(false)
  })
})

describe('importHandler (youtube)', () => {
  const CANNED: SourceMetadata = {
    title: 'Rick Astley - Never Gonna Give You Up',
    durationMs: 213_000,
    coverFile: 'cover.jpg',
  }

  it('downloads the audio and produces a Backing Track', async () => {
    const t = setup()
    insertTrack(t, { sourceKind: 'youtube', sourceRef: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'youtu.be/dQw4w9WgXcQ' })
    const ctx = buildCtx(t, 'j1')

    await importHandler(new FakeFetcher({ metadata: CANNED }))(ctx)

    const directory = trackDir(t.dataDir, TRACK_ID)
    expect(existsSync(join(directory, 'original.mp3'))).toBe(true)
    const backing = join(directory, BACKING_TRACK_FILE)
    expect(existsSync(backing)).toBe(true)
    const info = probe(backing)
    expect([info.streams[0]!.codec_name, info.streams[0]!.sample_rate, info.streams[0]!.channels])
      .toEqual(['pcm_s16le', '44100', 2])

    const track = getTrack(t)
    expect(track.import_state).toBe('ready')
    expect(track.title).toBe(CANNED.title)
    expect(track.cover_path).toBe('cover.jpg')
    expect(existsSync(join(directory, 'cover.jpg'))).toBe(true)
    // Duration comes from the audio that was actually downloaded, not the listing.
    expect(Math.abs((track.duration_ms as number) - 2000)).toBeLessThan(150)
  })

  it('writes metadata to the Track before the download starts', async () => {
    const t = setup()
    insertTrack(t, { sourceKind: 'youtube', sourceRef: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'youtu.be/dQw4w9WgXcQ' })
    const ctx = buildCtx(t, 'j1')
    let seen: Record<string, unknown> | undefined
    let seenProgress = 0

    await importHandler(new FakeFetcher({
      metadata: CANNED,
      onDownload: () => {
        seen = getTrack(t)
        seenProgress = (t.akapela.sqlite.prepare(`SELECT progress FROM jobs WHERE id = 'j1'`).get() as { progress: number }).progress
      },
    }))(ctx)

    expect(seen?.title).toBe(CANNED.title)
    expect(seen?.cover_path).toBe('cover.jpg')
    expect(seen?.duration_ms).toBe(213_000)
    expect(seen?.import_state).toBe('importing')
    expect(seenProgress).toBeGreaterThan(0)
  })

  it('keeps a title and cover the singer set, without fetching the thumbnail over it', async () => {
    const t = setup()
    insertTrack(t, { sourceKind: 'youtube', sourceRef: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'My title' })
    const directory = trackDir(t.dataDir, TRACK_ID)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'cover.jpg'), new Uint8Array([9, 9, 9]))
    t.akapela.sqlite
      .prepare(`UPDATE tracks SET title_edited = 1, cover_edited = 1, cover_path = 'cover.jpg' WHERE id = ?`)
      .run(TRACK_ID)
    const fetcher = new FakeFetcher({ metadata: CANNED })

    await importHandler(fetcher)(buildCtx(t, 'j1'))

    expect(fetcher.metadataOptions).toEqual({ keepCover: true })
    const track = getTrack(t)
    expect(track.import_state).toBe('ready')
    expect(track.title).toBe('My title')
    expect(track.cover_path).toBe('cover.jpg')
    expect(new Uint8Array(readFileSync(join(directory, 'cover.jpg')))).toEqual(new Uint8Array([9, 9, 9]))
  })

  it('keeps the placeholder cover when the video has no thumbnail', async () => {
    const t = setup()
    insertTrack(t, { sourceKind: 'youtube', sourceRef: 'https://www.youtube.com/watch?v=x', title: 'youtu.be/x' })
    const ctx = buildCtx(t, 'j1')
    const noCover: SourceMetadata = { title: 'Live set', durationMs: null, coverFile: null }

    await importHandler(new FakeFetcher({ metadata: noCover }))(ctx)

    const track = getTrack(t)
    expect(track.import_state).toBe('ready')
    expect(track.title).toBe('Live set')
    expect(track.cover_path).toBe('cover.svg')
  })

  it('records a failed metadata fetch and fails the Track', async () => {
    const t = setup()
    insertTrack(t, { sourceKind: 'youtube', sourceRef: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'youtu.be/dQw4w9WgXcQ' })
    const ctx = buildCtx(t, 'j1')

    await expect(
      importHandler(new FakeFetcher({ metadataError: '[youtube] dQw4w9WgXcQ: Video unavailable' }))(ctx),
    ).rejects.toThrow('[youtube] dQw4w9WgXcQ: Video unavailable')

    const track = getTrack(t)
    expect(track.import_state).toBe('failed')
    expect(track.title).toBe('youtu.be/dQw4w9WgXcQ')
    // The download never started, and nothing retries on its own.
    expect(existsSync(trackDir(t.dataDir, TRACK_ID))).toBe(false)
  })

  it('keeps the early metadata and fails the Track on a failed download', async () => {
    const t = setup()
    insertTrack(t, { sourceKind: 'youtube', sourceRef: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'youtu.be/dQw4w9WgXcQ' })
    const ctx = buildCtx(t, 'j1')

    await expect(
      importHandler(new FakeFetcher({ metadata: CANNED, downloadError: 'HTTP Error 403: Forbidden' }))(ctx),
    ).rejects.toThrow('403')

    const track = getTrack(t)
    expect(track.import_state).toBe('failed')
    expect(track.title).toBe(CANNED.title)
    expect(track.cover_path).toBe('cover.jpg')
    expect(existsSync(join(trackDir(t.dataDir, TRACK_ID), BACKING_TRACK_FILE))).toBe(false)
  })

  it('runs the whole import again on retry', async () => {
    const t = setup()
    insertTrack(t, { sourceKind: 'youtube', sourceRef: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'youtu.be/dQw4w9WgXcQ' })
    const ctx1 = buildCtx(t, 'j1')
    await expect(importHandler(new FakeFetcher({ metadataError: 'network down' }))(ctx1)).rejects.toThrow()
    expect(getTrack(t).import_state).toBe('failed')

    t.akapela.sqlite.prepare(`UPDATE tracks SET import_state = 'importing' WHERE id = ?`).run(TRACK_ID)
    const ctx2 = buildCtx(t, 'j2')
    await importHandler(new FakeFetcher({ metadata: CANNED }))(ctx2)

    expect(getTrack(t).import_state).toBe('ready')
    expect(existsSync(join(trackDir(t.dataDir, TRACK_ID), BACKING_TRACK_FILE))).toBe(true)
  })
})
