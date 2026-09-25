import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import { appendFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { restoreBounds, MIN_WINDOW_SIZE, type Bounds } from './bounds.js'
import { BRIDGE_CHANNELS, type DesktopUpdate, type DesktopUpdateInstallState, type LibraryChange } from './bridge.cjs'
import { ConfigStore, configPath } from './config.js'
import {
  compareServerVersion,
  normalizeServerUrl,
  probeServer,
  reconnectDelayMs,
  resolveServerMode,
  secureContextGrant,
  type ServerMode,
} from './connection.js'
import { windowIconOptions } from './icon.js'
import { developmentLayout, managedYtDlpPath, packagedLayout, type Layout } from './layout.js'
import { checkLibraryDir, defaultLibraryDir, LibraryDirError } from './library.js'
import { buildMenu } from './menu.js'
import { choosePort } from './port.js'
import { AkapelaServer, serverAnswersAt, ServerStartError } from './server.js'
import { choicePage, errorPage, loadingPage, parseShellAction, tooNewPage, unreachablePage, type ChoicePageOptions, type ShellAction } from './splash.js'
import { titleBarWindowOptions } from './titlebar.js'
import { automaticChecks, checkForUpdate, checkLatestRelease, offeredUpdate, RELEASES_URL, updateInstallMode } from './update-check.js'
import { UpdateInstaller } from './updater.js'

/**
 * Akapela's desktop shell.
 *
 * Deliberately thin (ADR 0009). It starts the same Nitro server compose runs,
 * on loopback, and points a window at it; almost every change to Akapela
 * belongs in the Nuxt app and never touches this directory. What is here is
 * what only a shell can do: pick and remember a port, supervise the server,
 * hand it absolute paths to the bundled tools, put the window back on a
 * monitor that still exists, and open a native folder picker.
 *
 * Where the window's Akapela comes from (`connection.ts`):
 *   - `AKAPELA_SERVER_URL` set — the contributor loop. The window points at a
 *     server someone else is running (`pnpm dev` or `aspire run`), so hot
 *     reload survives and the Aspire Dashboard keeps collecting its telemetry.
 *   - Use this computer — the shell starts `.output/server/index.mjs` itself
 *     and supervises it.
 *   - Connected — a server elsewhere, typically a compose install. The shell
 *     starts nothing of its own: no server, no port, no data directory, no
 *     bundled binaries. It is a window, a title bar, a bridge, and an update
 *     check, and it grants that one origin secure-context status so singing
 *     works (ADR 0015).
 *   - nothing chosen yet — first launch asks.
 *
 * `start()` is the one place the modes diverge.
 */

const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(here, '..', '..')

// One instance: a second launch focuses the window that is already open rather
// than starting a second server on a port the first one holds.
if (!app.requestSingleInstanceLock()) app.quit()

const store = new ConfigStore(configPath(app.getPath('userData')))

/**
 * Decided before anything else, because the secure-context grant is a
 * Chromium switch and only counts if it is set before the app is ready. A
 * change of server therefore restarts the app rather than switching in place.
 */
const mode: ServerMode = resolveServerMode(process.env.AKAPELA_SERVER_URL, store.read())
const grantedOrigin = secureContextGrant(mode)
if (grantedOrigin) app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', grantedOrigin)
const layout: Layout = app.isPackaged
  ? packagedLayout(process.resourcesPath, process.platform)
  : developmentLayout(desktopRoot, process.platform, process.arch)

let mainWindow: BrowserWindow | undefined
let server: AkapelaServer | undefined
let availableUpdate: DesktopUpdate | null = null

/**
 * Whether the window is pointed at a server someone else is running. Read here
 * rather than inside `whenReady`, because how this build takes an Update
 * depends on it: a contributor's window has no installer under it.
 */
const attachedServerUrl = mode.kind === 'attached' ? mode.url : undefined

/** How an Update is taken on this platform, in this build (ADR 0009's amendment on Updates). */
const installMode = updateInstallMode(process.platform, {
  packaged: app.isPackaged,
  attached: Boolean(attachedServerUrl),
  appImage: process.env.APPIMAGE,
})

const installer = new UpdateInstaller({
  expected: () => availableUpdate,
  onState: (state: DesktopUpdateInstallState) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(BRIDGE_CHANNELS.updateInstallStateChanged, state)
    }
  },
  log: (line) => {
    try {
      appendFileSync(serverLogFile(), `${line}
`)
    }
    catch { /* best effort; the prompt still tells the singer it could not update */ }
  },
})
/** Where `showApp` last pointed the window, so a crashed renderer can be reloaded back onto it. */
let currentOrigin: string | undefined

/** The library folder in use: what the singer chose, else `userData/data`. */
function libraryDir(): string {
  return store.read().libraryDir ?? defaultLibraryDir(app.getPath('userData'))
}

function serverLogFile(): string {
  return join(app.getPath('logs'), 'akapela-server.log')
}

/**
 * An override only when there is really something there.
 *
 * A packaged app always has its bundled binaries. A checkout has them only
 * after `pnpm fetch-binaries`, and `desktop/vendor/` is gitignored — so
 * pointing the server at a path that does not exist would fail every import
 * and every Mix with ENOENT. An empty value is what `server/lib/tools.ts`
 * treats as "not set", which puts it back on the `PATH` lookup a contributor's
 * machine already has.
 */
function overrideIfPresent(path: string): string {
  return existsSync(path) ? path : ''
}

/**
 * What the server is told about the world outside it. Every one of these is
 * ticket 02's tool seam: with none of them set the server resolves bare names
 * off `PATH` exactly as it does under compose, and with them set it uses the
 * absolute paths the installer shipped.
 */
function serverEnvironment(): NodeJS.ProcessEnv {
  const library = libraryDir()
  return {
    NUXT_DATA_DIR: library,
    NUXT_MIGRATIONS_DIR: layout.migrationsDir,
    // The Mix render hands ffmpeg the reverb impulse response as a file path,
    // and the server would otherwise resolve it against a cwd it inherited
    // from Electron rather than its own root — so a Mix with any reverb fails.
    AKAPELA_PUBLIC_DIR: overrideIfPresent(layout.publicDir),
    AKAPELA_FFMPEG: overrideIfPresent(layout.ffmpeg),
    AKAPELA_SEPARATE_CLI: overrideIfPresent(layout.separateCli),
    // The Mix render stretches the Backing Track in its own subprocess, with
    // the Rubber Band wasm the preview uses rather than ffmpeg's filter.
    AKAPELA_STRETCH_CLI: overrideIfPresent(layout.stretchCli),
    AKAPELA_RUBBERBAND_WASM: overrideIfPresent(layout.rubberBandWasm),
    // yt-dlp is not bundled: it chases a moving target and breaks quarterly,
    // so the app fetches it into the library's cache on first use and Settings
    // can replace it with one click (ADR 0010). This names where it goes;
    // `AKAPELA_MANAGE_YTDLP` is what tells the server it may put it there.
    AKAPELA_YTDLP: managedYtDlpPath(library, process.platform),
    AKAPELA_MANAGE_YTDLP: '1',
    // YouTube's player challenges are solved by running JavaScript in an
    // external runtime, and a singer who downloaded an installer has no Node
    // on their PATH. Electron's binary *is* Node when asked
    // (`ELECTRON_RUN_AS_NODE=1`, which `server/lib/tools.ts` sets on every
    // child it spawns), and yt-dlp's `--js-runtimes node:<path>` takes an
    // explicit path — so the runtime already in the installer is the one it
    // uses, and nothing extra ships for it.
    AKAPELA_JS_RUNTIME: process.execPath,
  }
}

async function createWindow(origin: string, onShellAction: (action: ShellAction) => void): Promise<BrowserWindow> {
  const bounds: Bounds = restoreBounds(
    store.read().bounds,
    screen.getAllDisplays().map(display => ({ workArea: display.workArea })),
  )

  const created = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    backgroundColor: '#121212',
    title: 'Akapela',
    ...titleBarWindowOptions(process.platform),
    ...windowIconOptions(process.platform, layout.windowIcon),
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // How a value reaches a sandboxed preload, which has no `app` of its own
      // and only a stripped-down `process`.
      additionalArguments: [`--akapela-version=${app.getVersion()}`],
    },
  })

  await created.loadURL(loadingPage())

  const remember = () => {
    if (!created.isDestroyed() && !created.isMinimized() && !created.isFullScreen()) {
      store.update({ bounds: created.getNormalBounds() })
    }
  }
  created.on('resized', remember)
  created.on('moved', remember)
  created.on('close', remember)

  // The window draws its own maximize/restore icon (`TitleBar.vue`), so it
  // has to hear about a maximize the singer triggered another way — a
  // double-click on the drag strip, a Windows snap — not only one it asked
  // the shell for through the bridge.
  created.on('maximize', () => created.webContents.send(BRIDGE_CHANNELS.windowMaximizedChanged, true))
  created.on('unmaximize', () => created.webContents.send(BRIDGE_CHANNELS.windowMaximizedChanged, false))

  // The operating system has already asked about the microphone — on macOS it
  // gates that on the entitlement in the Info.plist — so a second prompt has
  // nowhere useful to go. Anything other than media is refused rather than
  // silently granted.
  created.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'media')
  })

  // Links out of the app open in the singer's browser; the window itself never
  // leaves the server's own origin. The renderer stays on `http://` and never
  // `file://`, which is what keeps `127.0.0.1` a secure context — and with it
  // `getUserMedia` and the AudioWorklet engines.
  created.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target)
    return { action: 'deny' }
  })
  created.webContents.on('will-navigate', (event, target) => {
    // The shell's own screens ask for things by navigating to an address that
    // resolves nowhere; it is caught here and never loaded (`splash.ts`).
    const action = parseShellAction(target)
    if (action) {
      event.preventDefault()
      onShellAction(action)
      return
    }
    if (target.startsWith(origin) || target.startsWith('data:')) return
    event.preventDefault()
    if (/^https?:\/\//.test(target)) void shell.openExternal(target)
  })

  // A renderer crash (OOM, a GPU crash) otherwise leaves a blank, frozen
  // window while the server keeps running underneath it, unseen and
  // unreachable. `clean-exit` is a deliberate close, not a crash, and needs
  // no recovery; anything else gets reloaded back onto the app, or onto an
  // error page if there was nowhere yet to reload onto.
  created.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || created.isDestroyed()) return
    void created.loadURL(currentOrigin ?? errorPage(
      'Akapela crashed',
      `The window's process ended unexpectedly (${details.reason}). Close and reopen the app to try again.`,
    ))
  })

  return created
}

/** Points the window at the app itself. */
async function showApp(origin: string): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return
  currentOrigin = origin
  await mainWindow.loadURL(origin)
}

async function startAttached(url: string): Promise<void> {
  if (await serverAnswersAt(url)) {
    await showApp(url)
    return
  }
  await mainWindow?.loadURL(errorPage(
    'Nothing is listening there',
    `AKAPELA_SERVER_URL is ${url}, but no Akapela server answered.\n\n`
    + 'Start one in another terminal — `aspire run` from anywhere in the repo, or `pnpm dev` — '
    + 'then reload the window (View › Reload).',
  ))
}

async function startSupervised(): Promise<void> {
  // Picked once and remembered: `localStorage` is keyed by origin, so a fresh
  // port each launch would silently reset the volume, the theme, the latency
  // nudge, and the chosen microphone every time (see `port.ts`).
  const port = await choosePort(store.read().port)
  store.update({ port })

  server = new AkapelaServer({
    execPath: process.execPath,
    entry: layout.serverEntry,
    port,
    env: serverEnvironment(),
    logFile: serverLogFile(),
    onOutput: line => console.log(`[server] ${line}`),
  })

  try {
    await server.start()
  }
  catch (error) {
    await mainWindow?.loadURL(errorPage(
      'Akapela could not start',
      error instanceof ServerStartError
        ? `${error.message}\n\nThe server's own output is in ${serverLogFile()}.`
        : String(error),
    ))
    return
  }
  await showApp(server.origin)
}

/**
 * Connected: the server is on another machine, so it will go away — a reboot,
 * a sleeping laptop, another Wi-Fi network. While it is missing the window
 * shows a waiting screen and keeps asking, backing off so a server mid-boot
 * is not hammered, and loads the app the moment it answers. There is never a
 * local fallback: a different, empty library in its place is the worst thing
 * this could do.
 */
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let heartbeat: ReturnType<typeof setInterval> | undefined
const HEARTBEAT_MS = 15_000

function stopConnectionTimers(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (heartbeat) clearInterval(heartbeat)
  reconnectTimer = undefined
  heartbeat = undefined
}

async function connectTo(url: string, attempt = 0, lost = false): Promise<void> {
  stopConnectionTimers()
  if (!mainWindow || mainWindow.isDestroyed()) return
  const probe = await probeServer(url)
  if (probe.state === 'akapela') {
    // Checked on every connect, reconnects included: a server that went away
    // may have come back upgraded.
    if (compareServerVersion(probe.version, app.getVersion()) === 'newer') {
      currentOrigin = undefined
      await mainWindow.loadURL(tooNewPage(probe.version ?? '?', app.getVersion()))
      return
    }
    await showApp(url)
    watchConnection(url)
    return
  }
  const delay = reconnectDelayMs(attempt)
  const detail = probe.state === 'not-akapela'
    ? 'Something answered at that address, but it is not Akapela.'
    : lost
      ? 'The connection to your Akapela was lost. Anything being recorded when it went is gone; everything already saved is on the server.'
      : 'Nothing is answering there. The server may be off, asleep, or on another network.'
  currentOrigin = undefined
  await mainWindow.loadURL(unreachablePage(url, detail, Math.round(delay / 1000)))
  reconnectTimer = setTimeout(() => { void connectTo(url, attempt + 1, lost) }, delay)
}

/**
 * Notices the server going away while the app is open. A single missed answer
 * is a blip; two in a row mean it is gone.
 */
function watchConnection(url: string): void {
  let missed = 0
  heartbeat = setInterval(() => {
    void probeServer(url).then((probe) => {
      missed = probe.state === 'akapela' ? 0 : missed + 1
      if (missed >= 2) void connectTo(url, 0, true)
    })
  }, HEARTBEAT_MS)
}

/** First launch, and **Change server…**: this computer, or a server elsewhere. */
async function showChoice(options: ChoicePageOptions = {}): Promise<void> {
  stopConnectionTimers()
  currentOrigin = undefined
  const current = mode.kind === 'connected' ? mode.url : undefined
  await mainWindow?.loadURL(choicePage({ url: current, ...options }))
}

/** Stores a new choice and restarts into it: the secure-context grant only counts from startup. */
function restartInto(server: NonNullable<ReturnType<ConfigStore['read']>['server']>): void {
  store.update({ server })
  app.relaunch()
  app.quit()
}

async function onShellAction(action: ShellAction): Promise<void> {
  switch (action.kind) {
    case 'use-local':
      // Nothing was granted on a first launch, so there is nothing to restart
      // away from: start this computer's own server straight away.
      if (mode.kind === 'unchosen') {
        store.update({ server: { mode: 'local' } })
        await mainWindow?.loadURL(loadingPage())
        await startSupervised()
      }
      else {
        restartInto({ mode: 'local' })
      }
      return
    case 'test':
    case 'connect': {
      const normalized = normalizeServerUrl(action.url)
      if (!normalized.ok) {
        await showChoice({ url: action.url, message: { text: normalized.error, ok: false } })
        return
      }
      if (action.kind === 'connect') {
        restartInto({ mode: 'connected', url: normalized.url })
        return
      }
      await showChoice({ url: normalized.url, message: await describeProbe(normalized.url) })
      return
    }
    case 'retry':
      if (mode.kind === 'connected') await connectTo(mode.url)
      return
    case 'change-server':
      await showChoice()
      return
    case 'update':
      await shell.openExternal(availableUpdate?.url ?? RELEASES_URL)
  }
}

/** What **Test connection** found, as three different answers rather than one shrug. */
async function describeProbe(url: string): Promise<{ text: string, ok: boolean }> {
  const probe = await probeServer(url)
  if (probe.state === 'unreachable') {
    return { text: `Nothing answered at ${url}. Is the server on, and on this network?`, ok: false }
  }
  if (probe.state === 'not-akapela') {
    return { text: `Something answered at ${url}, but it is not Akapela.`, ok: false }
  }
  if (compareServerVersion(probe.version, app.getVersion()) === 'newer') {
    return { text: `Found Akapela ${probe.version}, which is newer than this app. Update the app before connecting.`, ok: false }
  }
  return { text: `Found Akapela${probe.version ? ` ${probe.version}` : ''} at ${url}.`, ok: true }
}

/** The one place the modes diverge: which Akapela the window opens, and what, if anything, is started for it. */
async function start(): Promise<void> {
  switch (mode.kind) {
    case 'attached':
      return startAttached(mode.url)
    case 'local':
      return startSupervised()
    case 'connected':
      return connectTo(mode.url)
    case 'unchosen':
      return showChoice()
  }
}

/** Restarts the server against whatever `serverEnvironment()` now says, and reloads the window onto it. */
async function restartServer(): Promise<void> {
  if (!server) return
  await mainWindow?.loadURL(loadingPage())
  server.reconfigure({ env: serverEnvironment() })
  await server.restart()
  await showApp(server.origin)
}

/**
 * The native folder picker, and the pointer change behind it. Changing the
 * library is a pointer change, not a move: nothing is copied or deleted at
 * either end, and the server is restarted against the new folder because the
 * database handle is opened and the migrations run at startup.
 */
async function chooseLibrary(): Promise<LibraryChange> {
  const current = libraryDir()
  if (!mainWindow) return { ok: false, dir: current, error: 'There is no window to open a folder picker from.' }

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a library folder',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Use this folder',
  })
  const chosen = filePaths[0]
  if (canceled || !chosen) return { ok: false, dir: current, cancelled: true }
  if (chosen === current) return { ok: true, dir: current }

  try {
    // Checked before the restart, never after, so the app cannot be left
    // pointing at a folder it cannot use.
    checkLibraryDir(chosen)
  }
  catch (error) {
    return { ok: false, dir: current, error: error instanceof LibraryDirError ? error.message : String(error) }
  }

  store.update({ libraryDir: chosen })
  // After the reply, so the renderer has said what happened before its page
  // goes away under it.
  setTimeout(() => { void restartServer() }, 0)
  return { ok: true, dir: chosen }
}

/**
 * Connected, the library is on the server and there is no folder here to
 * show, choose, or open — an empty answer is what tells Settings to leave
 * that section out, rather than pointing at a local folder nothing uses.
 */
const hasLocalLibrary = mode.kind !== 'connected'
const CONNECTED_LIBRARY_MESSAGE = 'This app is connected to a server, and the library lives there.'

function registerBridge(): void {
  ipcMain.handle(BRIDGE_CHANNELS.libraryDir, () => (hasLocalLibrary ? libraryDir() : ''))
  ipcMain.handle(BRIDGE_CHANNELS.chooseLibraryDir, (): Promise<LibraryChange> | LibraryChange =>
    hasLocalLibrary ? chooseLibrary() : { ok: false, dir: '', error: CONNECTED_LIBRARY_MESSAGE })
  ipcMain.handle(BRIDGE_CHANNELS.revealLibraryDir, async () => {
    if (hasLocalLibrary) await shell.openPath(libraryDir())
  })
  ipcMain.handle(BRIDGE_CHANNELS.update, () => offeredUpdate(availableUpdate, store.read().skippedUpdate))
  ipcMain.handle(BRIDGE_CHANNELS.skipUpdate, (_event, version: unknown) => {
    if (typeof version === 'string' && version) store.update({ skippedUpdate: version })
  })
  // The singer asked, so this ignores both the switch and anything skipped,
  // and it answers with why it found nothing rather than only whether it did.
  ipcMain.handle(BRIDGE_CHANNELS.checkForUpdateNow, async () => {
    const checked = await checkLatestRelease(app.getVersion())
    if (checked.state === 'available') availableUpdate = checked.update
    return checked
  })
  ipcMain.handle(BRIDGE_CHANNELS.automaticUpdateChecks, () => automaticChecks(store.read()))
  ipcMain.handle(BRIDGE_CHANNELS.updateInstallMode, () => installMode)
  ipcMain.handle(BRIDGE_CHANNELS.updateInstallState, () => installer.current())
  ipcMain.handle(BRIDGE_CHANNELS.installUpdate, async () => {
    if (installMode !== 'in-place') return
    await installer.download()
  })
  ipcMain.handle(BRIDGE_CHANNELS.restartToUpdate, async () => {
    if (installMode !== 'in-place') return
    // The server is stopped here rather than by the installer: it is holding
    // the database, and `will-quit` would otherwise be racing the installer
    // that is already replacing files.
    await installer.restart(async () => {
      const stopping = server
      server = undefined
      await stopping?.stop()
    })
  })
  ipcMain.handle(BRIDGE_CHANNELS.setAutomaticUpdateChecks, (_event, enabled: unknown) => {
    store.update({ automaticUpdateChecks: enabled !== false })
  })
  ipcMain.handle(BRIDGE_CHANNELS.openExternal, async (_event, url: unknown) => {
    // Reachable from the page, so only ever a link — never a local path.
    if (typeof url === 'string' && /^https?:\/\//.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle(BRIDGE_CHANNELS.isWindowMaximized, () => mainWindow?.isMaximized() ?? false)
  ipcMain.handle(BRIDGE_CHANNELS.minimizeWindow, () => mainWindow?.minimize())
  ipcMain.handle(BRIDGE_CHANNELS.toggleMaximizeWindow, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle(BRIDGE_CHANNELS.closeWindow, () => mainWindow?.close())
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  // macOS convention is to stay in the dock, but a running server with no
  // window is a process a singer can neither see nor stop, so Akapela quits.
  app.quit()
})

// The server is a real child process, and it has to be gone before Electron
// is. Quitting asks it to shut down so the Job runner's `close` hook runs,
// with a hard kill as a backstop. A Job caught mid-run stays `running` and the
// Track offers a retry — the same end a `docker compose down` gives it, and
// deliberately not worth a confirmation dialog.
app.on('will-quit', (event) => {
  if (!server) return
  event.preventDefault()
  const stopping = server
  server = undefined
  void stopping.stop().finally(() => app.quit())
})

// Node's default for an uncaught exception is to crash silently: no window,
// no log entry, nothing a bug report could quote. Everything else in this
// file that can fail does so through `errorPage`; anything reaching here is a
// bug rather than a handled condition, so it gets the same log file the
// server's own output goes to before the app gives up.
process.on('uncaughtException', (error) => {
  try {
    appendFileSync(serverLogFile(), `\n[akapela] main process crashed: ${error.stack ?? error}\n`)
  }
  catch { /* best effort; the dialog below still tells the singer something broke */ }
  dialog.showErrorBox('Akapela crashed', `${error.message}\n\nDetails were written to ${serverLogFile()}.`)
  const stopping = server
  server = undefined
  void (stopping ? stopping.stop() : Promise.resolve()).finally(() => app.exit(1))
})

void app.whenReady().then(async () => {
  registerBridge()

  const origin = mode.kind === 'connected' || mode.kind === 'attached' ? mode.url : 'http://127.0.0.1'
  mainWindow = await createWindow(origin, (action) => { void onShellAction(action) })
  mainWindow.on('closed', () => {
    mainWindow = undefined
    stopConnectionTimers()
  })

  if (mode.kind === 'connected') {
    // A reload, or a click that navigates, while the server is gone: the
    // waiting screen rather than Chromium's own error page. -3 is a navigation
    // this shell cancelled itself, which is not a failure.
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, url, isMainFrame) => {
      if (isMainFrame && errorCode !== -3 && url.startsWith(mode.url)) void connectTo(mode.url, 0, true)
    })
  }

  buildMenu({
    // Connected there is no local library folder to open or change.
    ...(hasLocalLibrary && mode.kind !== 'unchosen'
      ? {
          openLibraryFolder: () => { void shell.openPath(libraryDir()) },
          chooseLibraryFolder: () => { void chooseLibrary() },
        }
      : {}),
    // A development window follows `AKAPELA_SERVER_URL`, not a stored choice.
    ...(mode.kind === 'attached' ? {} : { changeServer: () => { void showChoice() } }),
    showLicenses: () => { void shell.openPath(layout.licensesDir) },
  })

  await start()

  // Nobody is blocked on this: it settles whenever it settles, and the page
  // asks for the answer when it renders — the Update prompt and the Settings
  // notice both read it through the bridge. Turned off in Settings, it is the
  // one outgoing request the app makes, and it is not made at all.
  if (automaticChecks(store.read())) availableUpdate = await checkForUpdate(app.getVersion())
})
