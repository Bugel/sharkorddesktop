import { app, BrowserWindow, Menu, shell, ipcMain, session, desktopCapturer, dialog, nativeImage, webFrameMain, globalShortcut } from 'electron';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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
const DEVICE_PREFS_KEY = 'devicePreferences';

type DevicePreferences = {
  audioInput?: string;
  videoInput?: string;
  audioInputLabel?: string;
  videoInputLabel?: string;
  audioInputVolume?: number;
  /** Push-to-talk: e.g. "KeyP", "Mouse4", "Mouse5" */
  pttBinding?: string;
};

function getDevicePreferences(): DevicePreferences {
  if (!store) return {};
  try {
    const raw = store.get(DEVICE_PREFS_KEY, '{}');
    return JSON.parse(raw) as DevicePreferences;
  } catch {
    return {};
  }
}

function setDevicePreferences(prefs: DevicePreferences): void {
  if (!store) return;
  store.set(DEVICE_PREFS_KEY, JSON.stringify(prefs));
}

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

  // When tabbed out (blur), start polling PTT key state on Windows (GetAsyncKeyState). Stop when focused again.
  mainWindow.on('blur', () => { startPttBackgroundPollIfWindows(); });
  mainWindow.on('focus', () => { stopPttBackgroundPoll(); });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-frame-navigate', (_event, url, _httpResponseCode, _httpStatusText, _isMainFrame, frameProcessId, frameRoutingId) => {
    if (!url || url.startsWith('file:')) return;
    const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
    if (frame && !(frame as { isDestroyed?: () => boolean }).isDestroyed?.()) {
      frame.once('dom-ready', () => {
        injectDevicePrefsIntoFrame(frame);
      });
    }
  });
  mainWindow.webContents.on('did-frame-finish-load', () => {
    injectDevicePrefsIntoFrames();
  });

}

function getDevicePrefsInjectionCode(): string {
  const prefs = getDevicePreferences();
  const prefsJson = JSON.stringify(prefs);
  const pttBinding = prefs.pttBinding ? JSON.stringify(prefs.pttBinding) : 'null';
  return [
    '(function(){var p=' + prefsJson + ';var md=navigator.mediaDevices;if(!md)return;',
    'window.__sharkordPttAudioTracks=window.__sharkordPttAudioTracks||[];',
    'var pttBinding=' + pttBinding + ';',
    'var origGUM=md.getUserMedia&&md.getUserMedia.bind(md);var origEnum=md.enumerateDevices&&md.enumerateDevices.bind(md);',
    'function addTracksToPtt(stream){if(!stream.getAudioTracks)return;stream.getAudioTracks().forEach(function(tr){if(window.__sharkordPttAudioTracks.indexOf(tr)===-1)window.__sharkordPttAudioTracks.push(tr);if(pttBinding)tr.enabled=false;});}',
    'if(origGUM){md.getUserMedia=function(c){var t=typeof c==="object"&&c!==null?JSON.parse(JSON.stringify(c)):{};',
    'if(p.audioInput==="none"&&t.audio)t.audio=false;else if(p.audioInput&&p.audioInput!=="none"&&t.audio){t.audio=t.audio===true?{deviceId:{exact:p.audioInput}}:Object.assign({},t.audio,{deviceId:{exact:p.audioInput}});}',
    'if(p.videoInput==="none"&&t.video)t.video=false;else if(p.videoInput&&p.videoInput!=="none"&&t.video){t.video=t.video===true?{deviceId:{exact:p.videoInput}}:Object.assign({},t.video,{deviceId:{exact:p.videoInput}});}',
    'return origGUM(t).then(function(stream){',
    'addTracksToPtt(stream);',
    'if(!stream.getAudioTracks||stream.getAudioTracks().length===0||p.audioInputVolume== null)return stream;',
    'var vol=(p.audioInputVolume/100)||1;if(vol===1)return stream;',
    'var ctx=new(window.AudioContext||window.webkitAudioContext)();var src=ctx.createMediaStreamSource(stream);var g=ctx.createGain();g.gain.value=vol;var dest=ctx.createMediaStreamDestination();src.connect(g);g.connect(dest);',
    'var out=new MediaStream();dest.stream.getAudioTracks().forEach(function(tr){out.addTrack(tr);});',
    'if(stream.getVideoTracks().length)stream.getVideoTracks().forEach(function(tr){out.addTrack(tr);});',
    'addTracksToPtt(out);',
    'return out;});};}',
    'if(origEnum){md.enumerateDevices=function(){var out=[];',
    'if(p.audioInput&&p.audioInput!=="none")out.push({deviceId:p.audioInput,kind:"audioinput",label:p.audioInputLabel||"Microphone",groupId:""});',
    'if(p.videoInput&&p.videoInput!=="none")out.push({deviceId:p.videoInput,kind:"videoinput",label:p.videoInputLabel||"Camera",groupId:""});',
    'return out.length>0?Promise.resolve(out):origEnum();};}',
    'if(pttBinding&&String(pttBinding).indexOf("Mouse")===0){var btn=parseInt(String(pttBinding).slice(5),10)||0;',
    'document.addEventListener("mousedown",function(e){if(e.button===btn){e.preventDefault();if(window.parent!==window)window.parent.postMessage({type:"sharkord-ptt",pressed:true},"*");}},true);',
    'document.addEventListener("mouseup",function(e){if(e.button===btn){e.preventDefault();if(window.parent!==window)window.parent.postMessage({type:"sharkord-ptt",pressed:false},"*");}},true);}',
    'if(pttBinding&&String(pttBinding).indexOf("Key")===0){var keyCode=String(pttBinding);',
    'document.addEventListener("keydown",function(e){if(e.code===keyCode){e.preventDefault();e.stopPropagation();if(window.parent!==window)window.parent.postMessage({type:"sharkord-ptt",pressed:true},"*");}},true);',
    'document.addEventListener("keyup",function(e){if(e.code===keyCode){e.preventDefault();e.stopPropagation();if(window.parent!==window)window.parent.postMessage({type:"sharkord-ptt",pressed:false},"*");}},true);}',
    '})();'
  ].join('');
}

function injectDevicePrefsIntoFrame(frame: { url: string; executeJavaScript: (code: string) => Promise<unknown> }): void {
  const url = frame.url;
  if (!url || url.startsWith('file:')) return;
  try {
    frame.executeJavaScript(getDevicePrefsInjectionCode()).catch(() => {});
  } catch {
    /* ignore */
  }
}

function injectDevicePrefsIntoFrames(): void {
  if (!mainWindow?.webContents || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  const mainFrame = wc.mainFrame as {
    url: string;
    frames?: { url: string; executeJavaScript: (code: string) => Promise<unknown> }[];
    framesInSubtree?: { url: string; executeJavaScript: (code: string) => Promise<unknown> }[];
  };
  const frames = mainFrame.framesInSubtree ?? [mainFrame, ...(mainFrame.frames ?? [])];
  for (const frame of frames) {
    injectDevicePrefsIntoFrame(frame as { url: string; executeJavaScript: (code: string) => Promise<unknown> });
  }
}

let pttPressed = false;
/** Stop function for Windows background PTT poll (GetAsyncKeyState). */
let pttBackgroundStop: (() => void) | null = null;

function setPttPressed(pressed: boolean): void {
  pttPressed = pressed;
}

function registerPttGlobalShortcut(): void {
  /* No-op; background PTT is started on window blur (Windows only). */
}

function unregisterPttGlobalShortcut(): void {
  if (pttBackgroundStop) {
    pttBackgroundStop();
    pttBackgroundStop = null;
  }
}

function startPttBackgroundPollIfWindows(): void {
  if (process.platform !== 'win32' || !mainWindow) return;
  if (pttBackgroundStop) return; // already running
  const prefs = getDevicePreferences();
  const binding = prefs.pttBinding;
  if (!binding) return;
  import('./pttBackgroundPoller.js').then((m) => {
    const vk = m.pttBindingToVk(binding);
    if (vk == null) return;
    pttBackgroundStop = m.startPttBackgroundPoll(vk, (pressed: boolean) => {
      setPttPressed(pressed);
      applyPttStateToFrames();
    });
  }).catch(() => {});
}

function stopPttBackgroundPoll(): void {
  if (pttBackgroundStop) {
    pttBackgroundStop();
    pttBackgroundStop = null;
  }
}

function applyPttStateToFrames(): void {
  if (!mainWindow?.webContents || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  const mainFrame = wc.mainFrame as {
    url: string;
    frames?: { url: string; executeJavaScript: (code: string) => Promise<unknown> }[];
    framesInSubtree?: { url: string; executeJavaScript: (code: string) => Promise<unknown> }[];
  };
  const frames = mainFrame.framesInSubtree ?? [mainFrame, ...(mainFrame.frames ?? [])];
  const code = `(function(p){window.__sharkordPttAudioTracks&&window.__sharkordPttAudioTracks.forEach(function(t){t.enabled=p;});})(${pttPressed});`;
  for (const frame of frames) {
    try {
      const url = (frame as { url?: string }).url;
      if (url && !url.startsWith('file:')) {
        (frame as { executeJavaScript: (c: string) => Promise<unknown> }).executeJavaScript(code).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
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
  aboutWindow.webContents.once('did-finish-load', () => {
    const el = aboutWindow?.webContents;
    if (el && !el.isDestroyed()) {
      el.executeJavaScript(
        `(function(){var e=document.getElementById("about-version");if(e)e.textContent="Version ${app.getVersion()}";})();`
      ).catch(() => {});
    }
  });
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
        {
          label: 'Enter admin token…',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('open-admin-token-dialog');
            }
          }
        },
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
  registerPttGlobalShortcut();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  unregisterPttGlobalShortcut();
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

ipcMain.handle('submit-admin-token', async (_event, token: string, activeServerId: string | null) => {
  if (!mainWindow?.webContents || mainWindow.isDestroyed()) return;
  const trimmed = (token ?? '').trim();
  if (!trimmed) return;
  const servers = getSavedServers();
  let targetOrigin: string | null = null;
  if (activeServerId) {
    const server = servers.find((s) => s.id === activeServerId);
    if (server) {
      try {
        targetOrigin = new URL(server.url).origin;
      } catch {
        /* ignore */
      }
    }
  }
  const wc = mainWindow.webContents;
  const mainFrame = wc.mainFrame;
  const frames = (mainFrame as { frames?: { url: string; executeJavaScript: (code: string) => Promise<unknown> }[] }).frames ?? [];
  let frameToRun = frames.find((f) => {
    try {
      const origin = new URL(f.url).origin;
      return targetOrigin ? origin === targetOrigin : true;
    } catch {
      return false;
    }
  });
  if (!frameToRun && frames.length > 0) {
    frameToRun = frames[0];
  }
  if (frameToRun) {
    const code = `typeof window.useToken === 'function' && window.useToken(${JSON.stringify(trimmed)});`;
    await frameToRun.executeJavaScript(code).catch(() => {});
  }
});

ipcMain.handle('get-device-preferences', () => getDevicePreferences());

ipcMain.handle('set-device-preferences', (_event, prefs: DevicePreferences) => {
  setDevicePreferences(prefs ?? {});
  injectDevicePrefsIntoFrames();
  registerPttGlobalShortcut();
});

ipcMain.handle('request-apply-device-preferences', () => {
  injectDevicePrefsIntoFrames();
  registerPttGlobalShortcut();
});

ipcMain.handle('ptt-state', (_event, pressed: boolean) => {
  setPttPressed(!!pressed);
  applyPttStateToFrames();
});

ipcMain.handle('fetch-communities-database', async (_event, url: string) => {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) return null;
  try {
    const res = await fetch(u, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
});

const COMMUNITIES_HTML_URL = 'https://raw.githubusercontent.com/Bugel/sharkordserverdb/main/communities.html';
const COMMUNITIES_JSON_URL = 'https://raw.githubusercontent.com/Bugel/sharkordserverdb/main/communities.json';

function getCommunitiesCacheDir(): string {
  return path.join(app.getPath('userData'), 'communities-cache');
}

function ensureCommunitiesCacheDir(): void {
  const dir = getCommunitiesCacheDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function downloadCommunitiesFiles(): Promise<boolean> {
  ensureCommunitiesCacheDir();
  const dir = getCommunitiesCacheDir();
  const htmlPath = path.join(dir, 'communities.html');
  const jsonPath = path.join(dir, 'communities.json');
  const fallbackHtmlPath = path.join(__dirname, '..', 'static', 'communities', 'communities-for-github.html');

  try {
    const jsonRes = await fetch(COMMUNITIES_JSON_URL, { cache: 'no-store' });
    if (!jsonRes.ok) return false;
    const jsonText = await jsonRes.text();
    writeFileSync(jsonPath, jsonText, 'utf-8');
  } catch {
    return false;
  }

  try {
    const htmlRes = await fetch(COMMUNITIES_HTML_URL, { cache: 'no-store' });
    if (htmlRes.ok) {
      const htmlText = await htmlRes.text();
      writeFileSync(htmlPath, htmlText, 'utf-8');
    } else {
      if (existsSync(fallbackHtmlPath)) {
        writeFileSync(htmlPath, readFileSync(fallbackHtmlPath, 'utf-8'), 'utf-8');
      } else {
        return false;
      }
    }
  } catch {
    if (existsSync(fallbackHtmlPath)) {
      writeFileSync(htmlPath, readFileSync(fallbackHtmlPath, 'utf-8'), 'utf-8');
    } else {
      return false;
    }
  }
  writeFileSync(path.join(dir, 'last-refreshed.txt'), new Date().toISOString(), 'utf-8');
  return true;
}

ipcMain.handle('get-communities-page-url', async () => {
  const dir = getCommunitiesCacheDir();
  const htmlPath = path.join(dir, 'communities.html');
  if (!existsSync(htmlPath)) {
    const ok = await downloadCommunitiesFiles();
    if (!ok) return null;
  }
  return pathToFileURL(htmlPath).href;
});

ipcMain.handle('refresh-communities-cache', async () => {
  const dir = getCommunitiesCacheDir();
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  } catch {}
  return downloadCommunitiesFiles();
});
