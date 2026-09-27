import { describe, expect, it, vi } from 'vitest'
import {
  compareServerVersion,
  normalizeServerUrl,
  probeServer,
  reconnectDelayMs,
  resolveServerMode,
  secureContextGrant,
} from '../../../desktop/src/connection'

describe('normalizeServerUrl', () => {
  it('turns a bare host and port into an http URL', () => {
    expect(normalizeServerUrl('192.168.1.20:3000')).toEqual({ ok: true, url: 'http://192.168.1.20:3000' })
    expect(normalizeServerUrl('  karaoke.local  ')).toEqual({ ok: true, url: 'http://karaoke.local' })
  })

  it('keeps an http or https URL, dropping a trailing slash and anything after the origin', () => {
    expect(normalizeServerUrl('http://host:3000')).toEqual({ ok: true, url: 'http://host:3000' })
    expect(normalizeServerUrl('http://host:3000/')).toEqual({ ok: true, url: 'http://host:3000' })
    expect(normalizeServerUrl('https://karaoke.example')).toEqual({ ok: true, url: 'https://karaoke.example' })
    expect(normalizeServerUrl('HTTPS://Karaoke.Example/queue?x=1')).toEqual({ ok: true, url: 'https://karaoke.example' })
  })

  it('refuses what is not a web address', () => {
    for (const input of ['', '   ', 'ftp://host', 'http://', 'not a url', 'file:///etc/passwd', 'http://host:99999']) {
      const result = normalizeServerUrl(input)
      expect(result.ok, input).toBe(false)
    }
  })
})

describe('resolveServerMode', () => {
  it('lets AKAPELA_SERVER_URL win over anything stored, as the contributor loop needs', () => {
    expect(resolveServerMode('http://localhost:3000', { server: { mode: 'local' } }))
      .toEqual({ kind: 'attached', url: 'http://localhost:3000' })
  })

  it('asks on first launch, when nothing is stored', () => {
    expect(resolveServerMode(undefined, {})).toEqual({ kind: 'unchosen' })
    expect(resolveServerMode('  ', {})).toEqual({ kind: 'unchosen' })
  })

  it('keeps an install from before the choice existed on this computer, rather than asking again', () => {
    // A remembered port means this computer's own server has run here before.
    expect(resolveServerMode(undefined, { port: 51234 })).toEqual({ kind: 'local' })
    expect(resolveServerMode(undefined, { bounds: { width: 800 } })).toEqual({ kind: 'unchosen' })
  })

  it('remembers the choice once made', () => {
    expect(resolveServerMode(undefined, { server: { mode: 'local' } })).toEqual({ kind: 'local' })
    expect(resolveServerMode(undefined, { server: { mode: 'connected', url: '192.168.1.20:3000' } }))
      .toEqual({ kind: 'connected', url: 'http://192.168.1.20:3000' })
  })

  it('asks again rather than guessing when what is stored makes no sense', () => {
    expect(resolveServerMode(undefined, { server: { mode: 'connected', url: 'nonsense url' } })).toEqual({ kind: 'unchosen' })
    expect(resolveServerMode(undefined, { server: { mode: 'connected' } })).toEqual({ kind: 'unchosen' })
    // @ts-expect-error - a config file edited by hand
    expect(resolveServerMode(undefined, { server: { mode: 'sideways' } })).toEqual({ kind: 'unchosen' })
  })
})

describe('secureContextGrant', () => {
  it('names exactly the one origin the singer entered, when it is plain http', () => {
    expect(secureContextGrant({ kind: 'connected', url: 'http://192.168.1.20:3000' })).toBe('http://192.168.1.20:3000')
  })

  it('agrees with what the window loads, since both come from the same normalisation', () => {
    const mode = resolveServerMode(undefined, { server: { mode: 'connected', url: '192.168.1.20:3000/' } })
    expect(mode.kind).toBe('connected')
    expect(secureContextGrant(mode)).toBe(mode.kind === 'connected' ? mode.url : null)
  })

  it('grants nothing to https, to this computer, to a development server, or before a choice', () => {
    expect(secureContextGrant({ kind: 'connected', url: 'https://karaoke.example' })).toBeNull()
    expect(secureContextGrant({ kind: 'local' })).toBeNull()
    expect(secureContextGrant({ kind: 'attached', url: 'http://localhost:3000' })).toBeNull()
    expect(secureContextGrant({ kind: 'unchosen' })).toBeNull()
  })
})

describe('compareServerVersion', () => {
  it('refuses only a server newer than the shell', () => {
    expect(compareServerVersion('1.3.0', '1.2.2')).toBe('newer')
    expect(compareServerVersion('2.0.0', '1.10.0')).toBe('newer')
    expect(compareServerVersion('1.10.0', '1.9.9')).toBe('newer')
  })

  it('accepts an older or equal server, which is the safe direction', () => {
    expect(compareServerVersion('1.2.2', '1.2.2')).toBe('ok')
    expect(compareServerVersion('v1.2.2', '1.2.2')).toBe('ok')
    expect(compareServerVersion('1.1.9', '1.2.0')).toBe('ok')
    expect(compareServerVersion('1.9.0', '1.10.0')).toBe('ok')
  })

  it('orders a pre-release below its Release', () => {
    expect(compareServerVersion('1.3.0-beta.1', '1.3.0')).toBe('ok')
    expect(compareServerVersion('1.3.0', '1.3.0-beta.1')).toBe('newer')
    expect(compareServerVersion('1.3.0-beta.2', '1.3.0-beta.1')).toBe('newer')
    expect(compareServerVersion('1.3.0-beta.10', '1.3.0-beta.9')).toBe('newer')
  })

  it('loads a server that reports no version, or one that does not parse', () => {
    expect(compareServerVersion(undefined, '1.2.2')).toBe('ok')
    expect(compareServerVersion('', '1.2.2')).toBe('ok')
    expect(compareServerVersion('latest', '1.2.2')).toBe('ok')
  })
})

describe('probeServer', () => {
  function answering(body: unknown, status = 200): typeof fetch {
    return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch
  }

  it('recognises an Akapela and reads its version', async () => {
    const fetchImpl = answering({ app: 'akapela', version: '1.2.2' })

    await expect(probeServer('http://host:3000', fetchImpl)).resolves.toEqual({ state: 'akapela', version: '1.2.2' })
    expect(fetchImpl).toHaveBeenCalledWith('http://host:3000/api/version', expect.anything())
  })

  it('tells a web server that is not an Akapela from one that does not answer', async () => {
    await expect(probeServer('http://host', answering('<html>router login</html>'))).resolves.toEqual({ state: 'not-akapela' })
    await expect(probeServer('http://host', answering({ app: 'something else' }))).resolves.toEqual({ state: 'not-akapela' })
    await expect(probeServer('http://host', answering('nope', 404))).resolves.toEqual({ state: 'not-akapela' })

    const refused = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    await expect(probeServer('http://host', refused)).resolves.toEqual({ state: 'unreachable' })
  })

  it('treats an older Akapela without the version route as an Akapela of unknown version', async () => {
    // Every Release before this route existed still serves the health of its API.
    const fetchImpl = vi.fn(async (url: string) => url.endsWith('/api/version')
      ? new Response('not found', { status: 404 })
      : new Response(JSON.stringify({ busy: false }), { status: 200 })) as unknown as typeof fetch

    await expect(probeServer('http://host', fetchImpl)).resolves.toEqual({ state: 'akapela', version: undefined })
  })
})

describe('reconnectDelayMs', () => {
  it('backs off from a couple of seconds to half a minute, never hammering a server mid-boot', () => {
    const delays = Array.from({ length: 8 }, (_, attempt) => reconnectDelayMs(attempt))

    expect(delays[0]).toBe(2_000)
    for (let i = 1; i < delays.length; i++) expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!)
    expect(Math.max(...delays)).toBe(30_000)
  })
})
