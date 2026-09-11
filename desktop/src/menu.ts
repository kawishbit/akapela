import { Menu, shell, type MenuItemConstructorOptions } from 'electron'

/**
 * The application menu.
 *
 * Not polish: an Electron app with no menu on macOS has no working ⌘C/⌘V/⌘A
 * in text inputs, which would mean the Lyrics paste box and the Song title
 * field silently refuse to paste. The standard Edit roles are what make those
 * work — this is a bug fix wearing a menu's clothes.
 *
 * Everything else is trimmed to what Akapela actually offers.
 */

export interface MenuActions {
  openLibraryFolder: () => void
  chooseLibraryFolder: () => void
  showLicenses: () => void
}

const SOURCE_URL = 'https://github.com/kawishbit/akapela'

export function buildMenu(actions: MenuActions): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: 'Akapela',
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Library Folder', click: actions.openLibraryFolder },
        { label: 'Change Library Folder…', click: actions.chooseLibraryFolder },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // The reason this file exists.
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [{ role: 'pasteAndMatchStyle' as const }] : []),
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      role: 'window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Source Code',
          click: () => { void shell.openExternal(SOURCE_URL) },
        },
        // GPL-3.0 with GPL binaries in the installer: the licence texts ship,
        // and this is the link to them the obligation asks for.
        { label: 'Source and Licences', click: actions.showLicenses },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
