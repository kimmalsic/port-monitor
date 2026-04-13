import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  screen,
  nativeImage,
  session,
  shell,
} from 'electron';
import path from 'node:path';
import { IPC } from '../shared/ipc';
import type { KillTarget, PortEntry, PortsPayload, Settings } from '../shared/types';
import { scanAllPorts } from './scanners';
import { killProcess } from './killer';
import { checkExternalPort } from './external-check';
import { store, getWindowBounds, setWindowBounds } from './store';

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
  process.exit(0);
}

const isWsl =
  !!process.env.WSL_DISTRO_NAME ||
  !!process.env.WSL_INTEROP ||
  (() => {
    try {
      return /microsoft/i.test(require('node:fs').readFileSync('/proc/version', 'utf8'));
    } catch {
      return false;
    }
  })();

if (process.env.PORT_MONITOR_DISABLE_GPU === '1' || isWsl) {
  app.disableHardwareAcceleration();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let boundsSaveTimer: NodeJS.Timeout | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let pollRunning = false;
let registeredHotkey: string | null = null;
let isQuitting = false;
let cachedIncludeWsl = store.get('includeWsl');
let lastPayloadKey = '';

const isDev = !app.isPackaged;

// In WSLg, `workArea` matches the full display bounds because the Windows
// host taskbar isn't visible to the guest Electron. Apply a fudge factor so
// bottom snaps don't slide under the host taskbar. No effect on real Windows.
const WSL_BOTTOM_INSET = isWsl ? 48 : 0;

function computeWindowPosition(
  width: number,
  height: number,
  snap: Settings['window']['snap'],
  display?: Electron.Display,
) {
  const target = display ?? screen.getPrimaryDisplay();
  const area = target.workArea;
  const availableH = area.height - WSL_BOTTOM_INSET;
  const h = Math.min(height, availableH);
  const left = snap === 'tl' || snap === 'bl';
  const top = snap === 'tl' || snap === 'tr';
  const x = left ? area.x : area.x + area.width - width;
  const y = top ? area.y : area.y + availableH - h;
  return { x, y, width, height: h };
}

// Windows' per-monitor DPI awareness: persist bounds in physical screen pixels
// so that restoring on a display with a different scale factor produces the
// correct size. Non-Windows platforms treat DIPs as the canonical unit.
const USE_PHYSICAL_BOUNDS = process.platform === 'win32';

function dipBoundsToStorage(
  win: BrowserWindow,
  bounds: { x: number; y: number; width: number; height: number },
) {
  if (!USE_PHYSICAL_BOUNDS) return bounds;
  return screen.dipToScreenRect(win, bounds);
}

function storageToDipBounds(stored: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  if (!USE_PHYSICAL_BOUNDS) return stored;
  // Passing null uses the display containing the rect — respects that
  // display's scale factor, not the primary display's.
  return screen.screenToDipRect(null as unknown as BrowserWindow, stored);
}

function isBoundsOnAnyDisplay(b: { x: number; y: number; width: number; height: number }): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return (
      b.x + b.width > a.x &&
      b.x < a.x + a.width &&
      b.y + b.height > a.y &&
      b.y < a.y + a.height
    );
  });
}

function scheduleBoundsSave() {
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
    const dip = mainWindow.getBounds();
    const stored = dipBoundsToStorage(mainWindow, dip);
    setWindowBounds(stored);
  }, 500);
}

function createWindow() {
  // Omit x/y/width/height from the constructor: on Windows multi-DPI setups,
  // Electron interprets constructor bounds against the primary display's
  // scale factor, so a window last seen on a 125% secondary monitor comes
  // back smaller after a relaunch. We defer bounds to `ready-to-show`, where
  // setBounds can use the correct target display.
  mainWindow = new BrowserWindow({
    width: 280,
    height: 700,
    minWidth: 220,
    minHeight: 400,
    maxWidth: 600,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: store.get('alwaysOnTop'),
    backgroundColor: '#0e0f12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.setMenu(null);

  mainWindow.webContents.on(
    'console-message' as never,
    (...args: unknown[]) => {
      const detail = args[1] && typeof args[1] === 'object' ? args[1] : null;
      if (detail) {
        const d = detail as { level?: number; message?: string; lineNumber?: number; sourceId?: string };
        console.log(`[renderer:${d.level ?? '?'}] ${d.message ?? ''} (${d.sourceId ?? ''}:${d.lineNumber ?? 0})`);
      } else {
        console.log(`[renderer] ${args[2] ?? ''} (${args[4] ?? ''}:${args[3] ?? 0})`);
      }
    },
  );
  mainWindow.webContents.on('did-fail-load', (_, code, desc, url) => {
    console.log(`[renderer:did-fail-load] ${code} ${desc} ${url}`);
  });
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.log(`[renderer:gone] ${details.reason} ${details.exitCode}`);
  });

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.on('resize', scheduleBoundsSave);
  mainWindow.on('move', scheduleBoundsSave);

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    if (!tray && !registeredHotkey) {
      // No tray and no hotkey: hiding would strand the app. Let it quit.
      return;
    }
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('blur', () => {
    if (store.get('autoHideOnBlur') && mainWindow?.isVisible()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('hide', () => {
    stopPolling();
    refreshTrayMenu();
  });
  mainWindow.on('show', () => {
    startPolling();
    refreshTrayMenu();
    applyStoredBounds();
  });

  mainWindow.once('ready-to-show', () => {
    applyStoredBounds();
    if (!store.get('startHidden') && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
}

// Workaround for Electron multi-monitor DPI bug. The window shrinks when:
//   (a) shown after hide on a display with a different scale factor, or
//   (b) relaunched with bounds passed to the BrowserWindow constructor.
// Fix: create the window at a default size on the primary display (no x/y in
// the constructor), then setBounds to the persisted rect after ready-to-show
// and on every subsequent show. Bounds are stored in physical pixels on
// Windows so screenToDipRect uses the *target* display's scale factor.
// Refs: electron/electron#10862, #29605, PR #10972
function applyStoredBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const saved = getWindowBounds();
  if (saved.x == null || saved.y == null) {
    const pos = computeWindowPosition(saved.width, saved.height, saved.snap);
    mainWindow.setBounds(pos);
    return;
  }
  const stored = {
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
  };
  const targetDip = storageToDipBounds(stored);
  if (!isBoundsOnAnyDisplay(targetDip)) {
    const pos = computeWindowPosition(saved.width, saved.height, saved.snap);
    mainWindow.setBounds(pos);
    return;
  }
  // Two-phase: move first so Windows migrates the window to the target
  // display (engaging its scale factor), then resize. One-shot setBounds can
  // still mis-scale on a fresh BrowserWindow instance.
  const current = mainWindow.getBounds();
  if (current.x !== targetDip.x || current.y !== targetDip.y) {
    mainWindow.setBounds({
      x: targetDip.x,
      y: targetDip.y,
      width: current.width,
      height: current.height,
    });
  }
  mainWindow.setBounds(targetDip);
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? '숨기기' : '열기',
      click: toggleWindow,
    },
    {
      label: '설정',
      submenu: [
        {
          label: '항상 위에 표시',
          type: 'checkbox',
          checked: store.get('alwaysOnTop'),
          click: (item) => {
            store.set('alwaysOnTop', item.checked);
            mainWindow?.setAlwaysOnTop(item.checked);
          },
        },
        {
          label: '포커스 잃으면 자동 숨김',
          type: 'checkbox',
          checked: store.get('autoHideOnBlur'),
          click: (item) => store.set('autoHideOnBlur', item.checked),
        },
        {
          label: 'WSL 포트 포함',
          type: 'checkbox',
          checked: store.get('includeWsl'),
          click: (item) => {
            store.set('includeWsl', item.checked);
            cachedIncludeWsl = item.checked;
          },
        },
        { type: 'separator' },
        { label: '오른쪽 위', click: () => applySnap('tr') },
        { label: '오른쪽 아래', click: () => applySnap('br') },
        { label: '왼쪽 위', click: () => applySnap('tl') },
        { label: '왼쪽 아래', click: () => applySnap('bl') },
      ],
    },
    { type: 'separator' },
    { label: '종료', click: quitApp },
  ]);
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function resolveTrayIcon() {
  const isMac = process.platform === 'darwin';
  const name = isMac ? 'tray-icon-mac.png' : 'tray-icon.png';
  const candidates = [
    path.join(__dirname, '..', '..', 'build', name),
    path.join(process.resourcesPath ?? '', name),
  ];
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      if (isMac) img.setTemplateImage(true);
      return img;
    }
  }
  return nativeImage.createEmpty();
}

function createTray() {
  try {
    tray = new Tray(resolveTrayIcon());
    tray.setToolTip('Port Monitor');
    refreshTrayMenu();
    tray.on('click', toggleWindow);
    console.log('[tray] created');
  } catch (e) {
    console.log('[tray] unavailable:', (e as Error).message);
    tray = null;
  }
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function applySnap(snap: Settings['window']['snap']) {
  if (!mainWindow) return;
  setWindowBounds({ snap });
  const currentBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds) ?? screen.getPrimaryDisplay();
  const pos = computeWindowPosition(currentBounds.width, currentBounds.height, snap, display);
  mainWindow.setBounds(pos);
  // Store in the same unit (physical pixels on Windows) as the debounced saver.
  const stored = dipBoundsToStorage(mainWindow, pos);
  setWindowBounds({ x: stored.x, y: stored.y, width: stored.width, height: stored.height });
  broadcastSettings();
}

function broadcastSettings() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC.settingsUpdated, store.store);
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

function registerHotkey(accelerator: string) {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }
  try {
    if (globalShortcut.register(accelerator, toggleWindow)) {
      registeredHotkey = accelerator;
      console.log('[hotkey] registered:', accelerator);
    } else {
      console.log('[hotkey] failed to register:', accelerator);
    }
  } catch {
    // user-provided accelerator may be malformed; silent so typing a bad hotkey doesn't crash.
  }
}

function portsKey(ports: PortEntry[]): string {
  // Cheap structural hash: id + state + pid + remote. Skips trivially identical ticks.
  let h = '';
  for (const p of ports) {
    h += `${p.id}|${p.state}|${p.pid ?? ''}|${p.remoteAddress ?? ''}:${p.remotePort ?? ''};`;
  }
  return h;
}

async function runScan(): Promise<PortsPayload | null> {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const { ports, errors } = await scanAllPorts({ includeWsl: cachedIncludeWsl });
  return {
    ports,
    scannedAt: Date.now(),
    error: errors.length > 0 ? errors.join('; ') : null,
  };
}

function sendPayloadIfChanged(payload: PortsPayload) {
  const key = `${payload.error ?? ''}#${portsKey(payload.ports)}`;
  if (key === lastPayloadKey) return;
  lastPayloadKey = key;
  mainWindow?.webContents.send(IPC.portsUpdate, payload);
}

function startPolling() {
  if (pollTimer) return;
  const tick = async () => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
      pollTimer = null;
      return;
    }
    if (pollRunning) {
      pollTimer = setTimeout(tick, store.get('pollIntervalMs'));
      return;
    }
    pollRunning = true;
    try {
      const payload = await runScan();
      if (payload) sendPayloadIfChanged(payload);
    } finally {
      pollRunning = false;
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        pollTimer = setTimeout(tick, store.get('pollIntervalMs'));
      } else {
        pollTimer = null;
      }
    }
  };
  pollTimer = setTimeout(tick, 0);
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function isSafeExternalUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function registerIpc() {
  ipcMain.handle(IPC.settingsGet, () => store.store);
  ipcMain.handle(IPC.settingsSet, (_, patch: Partial<Settings>) => {
    for (const key of Object.keys(patch) as (keyof Settings)[]) {
      const value = patch[key];
      if (value !== undefined) store.set(key, value as Settings[typeof key]);
    }
    if (patch.alwaysOnTop !== undefined) mainWindow?.setAlwaysOnTop(patch.alwaysOnTop);
    if (patch.hotkey) registerHotkey(patch.hotkey);
    if (patch.includeWsl !== undefined) cachedIncludeWsl = patch.includeWsl;
    if (patch.pollIntervalMs) {
      stopPolling();
      startPolling();
    }
    refreshTrayMenu();
    broadcastSettings();
    return store.store;
  });
  ipcMain.handle(IPC.portsRefresh, async () => {
    const payload = await runScan();
    if (payload) sendPayloadIfChanged(payload);
  });
  ipcMain.handle(IPC.processKill, (_, pid: number, target: KillTarget) =>
    killProcess(pid, target),
  );
  ipcMain.handle(IPC.portExternalCheck, (_, port: number) => checkExternalPort(port));
  ipcMain.on(IPC.windowHide, () => mainWindow?.hide());
  ipcMain.on(IPC.appQuit, quitApp);
  ipcMain.on(IPC.windowSnap, (_, snap: Settings['window']['snap']) => applySnap(snap));
  ipcMain.on(IPC.shellOpen, (_, url: string) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
});

// macOS: clicking dock icon while hidden should restore the window.
app.on('activate', () => {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
});

// Hide from dock on macOS since we live in the menu bar (tray).
if (process.platform === 'darwin') {
  app.dock?.hide();
}

function installProductionCsp() {
  if (isDev) return;
  const csp =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; img-src 'self' data:";
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

app.whenReady().then(() => {
  installProductionCsp();
  registerIpc();
  createWindow();
  createTray();
  registerHotkey(store.get('hotkey'));
  startPolling();
});

app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopPolling();
});
