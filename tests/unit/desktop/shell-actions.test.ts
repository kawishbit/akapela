import { describe, expect, it } from 'vitest'
import { parseShellAction, shellActionUrl, SHELL_ACTION_ORIGIN } from '../../../desktop/src/splash'

describe('parseShellAction', () => {
  it('reads each thing a shell screen can ask for', () => {
    expect(parseShellAction(shellActionUrl('use-local'))).toEqual({ kind: 'use-local' })
    expect(parseShellAction(`${SHELL_ACTION_ORIGIN}/test?url=192.168.1.20%3A3000`)).toEqual({ kind: 'test', url: '192.168.1.20:3000' })
    expect(parseShellAction(`${SHELL_ACTION_ORIGIN}/connect?url=http%3A%2F%2Fhost`)).toEqual({ kind: 'connect', url: 'http://host' })
    expect(parseShellAction(shellActionUrl('retry'))).toEqual({ kind: 'retry' })
    expect(parseShellAction(shellActionUrl('change-server'))).toEqual({ kind: 'change-server' })
    expect(parseShellAction(shellActionUrl('update'))).toEqual({ kind: 'update' })
  })

  it('treats a missing address as an empty one, for the normalisation to refuse', () => {
    expect(parseShellAction(`${SHELL_ACTION_ORIGIN}/connect`)).toEqual({ kind: 'connect', url: '' })
  })

  it('ignores anything that is not one of its own actions', () => {
    expect(parseShellAction('http://192.168.1.20:3000/queue')).toBeNull()
    expect(parseShellAction(`${SHELL_ACTION_ORIGIN}/delete-everything`)).toBeNull()
    expect(parseShellAction('data:text/html,hello')).toBeNull()
    expect(parseShellAction('not a url')).toBeNull()
  })
})
