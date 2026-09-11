import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigStore, configPath, CONFIG_FILENAME } from '../../../desktop/src/config'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'akapela-desktop-config-'))
  file = configPath(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('configPath', () => {
  it('lives in the userData directory', () => {
    expect(configPath('/somewhere/userData')).toBe(join('/somewhere/userData', CONFIG_FILENAME))
  })
})

describe('ConfigStore', () => {
  it('reads an empty config on a first run', () => {
    expect(new ConfigStore(file).read()).toEqual({})
  })

  it('writes and reads back the port, the bounds, and the library', () => {
    new ConfigStore(file).update({ port: 54_321, bounds: { x: 10, y: 20, width: 1000, height: 700 } })

    expect(new ConfigStore(file).read()).toEqual({
      port: 54_321,
      bounds: { x: 10, y: 20, width: 1000, height: 700 },
    })
  })

  it('merges rather than replacing, so remembering the bounds does not forget the port', () => {
    const store = new ConfigStore(file)
    store.update({ port: 54_321 })
    store.update({ bounds: { x: 0, y: 0, width: 900, height: 600 } })

    expect(new ConfigStore(file).read()).toMatchObject({ port: 54_321 })
  })

  it('leaves no partial file behind', () => {
    new ConfigStore(file).update({ port: 54_321 })

    expect(existsSync(`${file}.part`)).toBe(false)
  })

  it('creates the directory it writes into', () => {
    const nested = join(dir, 'not', 'there', 'yet', CONFIG_FILENAME)
    new ConfigStore(nested).update({ port: 1234 })

    expect(JSON.parse(readFileSync(nested, 'utf8'))).toEqual({ port: 1234 })
  })

  it.each([
    ['corrupt JSON', '{ not json at all'],
    ['an array', '[1, 2, 3]'],
    ['null', 'null'],
    ['a bare string', '"hello"'],
  ])('reads %s as an empty config rather than refusing to open', (_label, contents) => {
    writeFileSync(file, contents)

    // Losing the window position is a much better outcome than an app that
    // will not start.
    expect(new ConfigStore(file).read()).toEqual({})
  })

  it('still writes over a file it could not read', () => {
    writeFileSync(file, '{ not json at all')
    new ConfigStore(file).update({ port: 54_321 })

    expect(new ConfigStore(file).read()).toEqual({ port: 54_321 })
  })
})
