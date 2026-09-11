import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { restoreBounds, MIN_WINDOW_SIZE, type Bounds } from './bounds.js'
import { BRIDGE_CHANNELS, type DesktopUpdate, type LibraryChange } from './bridge.cjs'
import { ConfigStore, configPath } from './config.js'
import { developmentLayout, managedYtDlpPath, packagedLayout, type Layout } from './layout.js'
import { checkLibraryDir, defaultLibraryDir, LibraryDirError } from './library.js'
import { buildMenu } from './menu.js'
import { choosePort } from './port.js'
import { AkapelaServer, serverAnswersAt, ServerStartError } from './server.js'
import { errorPage, loadingPage } from './splash.js'
import { titleBarWindowOptions } from './titlebar.js'
import { checkForUpdate } from './update-check.js'

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
 * Two modes:
 *   - `AKAPELA_SERVER_URL` set — the contributor loop. The window points at a
 *     server someone else is running (`pnpm dev` or `aspire run`), so hot
 *     reload survives and the Aspire Dashboard keeps collecting its telemetry.
 *   - unset — the production shape. The shell starts `.output/server/index.mjs`
 *     itself and supervises it.
 */

const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(here, '..', '..')

// One instance: a second launch focuses the window that is already open rather
// than starting a second server on a port the first one holds.
if (!app.requestSingleInstanceLock()) app.quit()

const store = new ConfigStore(configPath(app.getPath('userData')))
const layout: Layout = app.isPackaged
  ? packagedLayout(process.resourcesPath, process.platform)
  : developmentLayout(desktopRoot, process.platform, process.arch)

let mainWindow: BrowserWindow | undefined
let server: AkapelaServer | undefined
let availableUpdate: DesktopUpdate | null = null

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
    AKAPELA_FFPROBE: overrideIfPresent(layout.ffprobe),
    AKAPELA_SEPARATE_CLI: overrideIfPresent(layout.separateCli),
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

async function createWindow(origin: string): Promise<BrowserWindow> {
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
    if (target.startsWith(origin) || target.startsWith('data:')) return
    event.preventDefault()
    if (/^https?:\/\//.test(target)) void shell.openExternal(target)
  })

  return created
}

/** Points the window at the app itself. */
async function showApp(origin: string): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return
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

function registerBridge(): void {
  ipcMain.handle(BRIDGE_CHANNELS.libraryDir, () => libraryDir())
  ipcMain.handle(BRIDGE_CHANNELS.chooseLibraryDir, () => chooseLibrary())
  ipcMain.handle(BRIDGE_CHANNELS.revealLibraryDir, () => shell.openPath(libraryDir()))
  ipcMain.handle(BRIDGE_CHANNELS.update, () => availableUpdate)
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

void app.whenReady().then(async () => {
  registerBridge()

  const attachedUrl = process.env.AKAPELA_SERVER_URL?.trim()
  mainWindow = await createWindow(attachedUrl || 'http://127.0.0.1')
  mainWindow.on('closed', () => { mainWindow = undefined })

  buildMenu({
    openLibraryFolder: () => { void shell.openPath(libraryDir()) },
    chooseLibraryFolder: () => { void chooseLibrary() },
    showLicenses: () => { void shell.openPath(layout.licensesDir) },
  })

  if (attachedUrl) await startAttached(attachedUrl)
  else await startSupervised()

  // Nobody is blocked on this: it settles whenever it settles, and the
  // Settings page asks for the answer when it renders.
  availableUpdate = await checkForUpdate(app.getVersion())
})
