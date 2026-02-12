import { app, BrowserWindow, Menu, shell, ipcMain, session, desktopCapturer, dialog, nativeImage } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';

type SavedServer = {
  id: string;
  url: string;
  name: string;
  icon?: string;
  keepConnected?: boolean;
  identity?: string;
  password?: string;
};
type StoreType = { get: (key: string, defaultValue?: string) => string; set: (key: string, value: string) => void };
let store: StoreType | null = null;

const SAVED_SERVERS_KEY = 'savedServers';

function getSavedServers(): SavedServer[] {
  if (!store) return [];
  try {
    const raw = store.get(SAVED_SERVERS_KEY, '[]');
    return JSON.parse(raw) as SavedServer[];
  } catch {
    return [];
  }
}

function setSavedServers(servers: SavedServer[]): void {
  if (!store) return;
  store.set(SAVED_SERVERS_KEY, JSON.stringify(servers));
}

let mainWindow: BrowserWindow | null = null;
let prefsWindow: BrowserWindow | null = null;
let aboutWindow: BrowserWindow | null = null;

const DEFAULT_SERVER_URL = 'https://demo.sharkord.com';

function getServerUrl(): string {
  if (!store) return DEFAULT_SERVER_URL;
  const url = store.get('serverUrl', DEFAULT_SERVER_URL).trim();
  if (!url) return DEFAULT_SERVER_URL;
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

function getIconPath(): string {
  const base = path.join(app.getAppPath(), 'static');
  if (process.platform === 'win32') {
    const ico = path.join(base, 'icon.ico');
    if (existsSync(ico)) return ico;
  }
  return path.join(base, 'icon.png');
}

function createMainWindow(): void {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  const winIcon = icon.isEmpty() ? undefined : icon;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Sharkord Desktop',
    ...(winIcon && { icon: winIcon }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'static', 'wrapper.html'));
  mainWindow.once('ready-to-show', () => {
    if (winIcon && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIcon(winIcon);
    }
    mainWindow?.show();
  });

  // Force close when user clicks X or chooses Quit (don't let the page block with beforeunload)
  mainWindow.on('close', (event) => {
    if (!mainWindow) return;
    event.preventDefault();
    mainWindow.destroy();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function setupMediaPermissions(): void {
  const ses = session.defaultSession;

  // Allow camera and microphone (getUserMedia)
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Allow screen/window capture (getDisplayMedia); use system picker when available, else our picker
  ses.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['window', 'screen'] }).then((sources) => {
      if (sources.length === 0) {
        callback({});
        return;
      }
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(() => {
      callback({});
    });
  }, { useSystemPicker: true });
}

function createPreferencesWindow(): void {
  if (prefsWindow) {
    prefsWindow.focus();
    return;
  }

  prefsWindow = new BrowserWindow({
    width: 440,
    height: 200,
    resizable: false,
    title: 'Server URL',
    parent: mainWindow ?? undefined,
    modal: mainWindow !== null,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  prefsWindow.loadFile(path.join(__dirname, '..', 'static', 'preferences.html'));
  prefsWindow.on('closed', () => { prefsWindow = null; });
}

function createAboutWindow(): void {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 380,
    height: 240,
    resizable: false,
    title: 'About Sharkord Desktop',
    parent: mainWindow ?? undefined,
    modal: mainWindow !== null,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  aboutWindow.setMenu(null);
  aboutWindow.loadFile(path.join(__dirname, '..', 'static', 'about.html'));
  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  aboutWindow.on('closed', () => { aboutWindow = null; });
}

function clearAllSavedServers(): void {
  if (!store) return;
  const opts = {
    type: 'warning' as const,
    buttons: ['Cancel', 'Clear servers'],
    defaultId: 0,
    cancelId: 0,
    title: 'Clear saved servers',
    message: 'Clear all saved servers?',
    detail: 'This will remove your server list and reset the URL. Saved passwords for those servers will also be removed. This cannot be undone.'
  };
  const choice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showMessageBoxSync(mainWindow, opts)
    : dialog.showMessageBoxSync(opts);
  if (choice !== 1) return;
  store.set(SAVED_SERVERS_KEY, '[]');
  store.set('serverUrl', DEFAULT_SERVER_URL);
  session.defaultSession.clearStorageData({ storages: ['localstorage'] });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.reload();
  }
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Sharkord Desktop',
      submenu: [
        {
          label: 'About Sharkord Desktop',
          click: () => createAboutWindow()
        },
        { type: 'separator' as const },
        {
          label: 'Server URL…',
          accelerator: 'CmdOrCtrl+,',
          click: () => createPreferencesWindow()
        },
        {
          label: 'Clear all saved servers…',
          click: () => clearAllSavedServers()
        },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(process.platform === 'darwin' ? [{ role: 'close' as const }] : [])
      ]
    }
  ]);
}

app.whenReady().then(async () => {
  const { default: Store } = await import('electron-store');
  const StoreImpl = (await import('electron-store')).default;
  store = new StoreImpl<{ serverUrl: string; savedServers: string }>({
    defaults: { serverUrl: 'https://demo.sharkord.com', savedServers: '[]' }
  }) as unknown as StoreType;

  setupMediaPermissions();
  Menu.setApplicationMenu(buildMenu());
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for preload
ipcMain.handle('get-server-url', () => getServerUrl());

ipcMain.handle('set-server-url', (_event, url: string) => {
  if (!store) return;
  const normalized = (url || '').trim();
  const withProtocol =
    !normalized || normalized.startsWith('http://') || normalized.startsWith('https://')
      ? normalized
      : `https://${normalized}`;
  store.set('serverUrl', withProtocol || DEFAULT_SERVER_URL);
  prefsWindow?.close();
  const finalUrl = getServerUrl();
  if (mainWindow && mainWindow.webContents.getURL().startsWith('file:')) {
    mainWindow.webContents.send('wrapper-navigate', finalUrl);
  } else {
    mainWindow?.loadURL(finalUrl);
  }
});
ipcMain.handle('close-preferences', () => prefsWindow?.close());

// Saved servers (for server picker panel)
ipcMain.handle('desktop-get-servers', () => getSavedServers());

ipcMain.handle('desktop-add-server', (_event, server: { url: string; name: string }) => {
  const list = getSavedServers();
  const url = (server.url || '').trim();
  const withProtocol =
    url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
  if (list.some((s) => s.url === withProtocol)) return list;
  const newServer: SavedServer = {
    id: crypto.randomUUID(),
    url: withProtocol,
    name: (server.name || '').trim() || new URL(withProtocol).hostname
  };
  setSavedServers([...list, newServer]);
  return getSavedServers();
});

ipcMain.handle('desktop-remove-server', (_event, id: string) => {
  setSavedServers(getSavedServers().filter((s) => s.id !== id));
});

ipcMain.handle('desktop-update-server', (_event, id: string, updates: Partial<SavedServer>) => {
  const list = getSavedServers();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return list;
  const next = [...list];
  next[idx] = { ...next[idx], ...updates };
  setSavedServers(next);
  return getSavedServers();
});

ipcMain.handle('desktop-get-credentials-for-origin', (_event, origin: string) => {
  const server = getSavedServers().find((s) => {
    try {
      return new URL(s.url).origin === origin;
    } catch {
      return false;
    }
  });
  if (!server || !server.identity || !server.password) return null;
  return { identity: server.identity, password: server.password };
});

ipcMain.handle('desktop-set-credentials', (_event, origin: string, identity: string, password: string) => {
  const list = getSavedServers();
  const idx = list.findIndex((s) => {
    try {
      return new URL(s.url).origin === origin;
    } catch {
      return false;
    }
  });
  if (idx === -1) {
    const url = origin + '/';
    const newServer: SavedServer = {
      id: crypto.randomUUID(),
      url,
      name: new URL(url).hostname,
      identity,
      password
    };
    setSavedServers([...list, newServer]);
  } else {
    const next = [...list];
    next[idx] = { ...next[idx], identity, password };
    setSavedServers(next);
  }
});

ipcMain.handle('desktop-navigate-to-server', (_event, url: string) => {
  if (mainWindow && url) {
    const u = url.startsWith('http') ? url : `https://${url}`;
    mainWindow.loadURL(u);
  }
});
