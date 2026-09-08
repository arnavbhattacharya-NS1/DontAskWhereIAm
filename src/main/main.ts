import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  ipcMain,
  nativeImage,
  shell,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { loadSettings, getSettings } from './store';
import { initLogger, getLogger, getLogDir } from './logger';
import { loadHolidays } from './services/holidayService';
import { exchangeMondayCode, isMondayConnected } from './services/mondayService';
import { StatusEngine, type EngineEvent } from './engine';
import type { AppConfig, MondayStatus } from './types';
import { setupIpcHandlers } from './ipc';

// config is loaded inside app.whenReady() — do not call app.getAppPath() at top-level
let config: AppConfig;

let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let wizardWindow: BrowserWindow | null = null;
let boardPickerWindow: BrowserWindow | null = null;
let rowPickerWindow: BrowserWindow | null = null;
let engine: StatusEngine | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let midnightTimeout: ReturnType<typeof setTimeout> | null = null;

type TrayState = 'grey' | 'green' | 'orange' | 'red';
let trayState: TrayState = 'grey';
let todayStatus: MondayStatus | null = null;

// ─── Tray icon helpers ─────────────────────────────────────────────────────

function getAssetPath(name: string): string {
  return path.join(app.getAppPath(), 'assets', name);
}

function getTrayIcon(state: TrayState): Electron.NativeImage {
  // Use @2x retina variant when available; Electron picks the right one via
  // nativeImage.createFromPath when the @2x file sits next to the 1x file.
  const iconPath = getAssetPath(`tray-${state}.png`);
  const img = nativeImage.createFromPath(iconPath);
  // Attach @2x representation if it exists
  const retina = getAssetPath(`tray-${state}@2x.png`);
  if (fs.existsSync(retina)) {
    img.addRepresentation({ scaleFactor: 2.0, dataURL: nativeImage.createFromPath(retina).toDataURL() });
  }
  return img;
}

function updateDockIcon(state: TrayState): void {
  if (!app.dock) return; // Windows / Linux have no dock API
  const base   = getAssetPath(`dock-${state}.png`);
  const retina = getAssetPath(`dock-${state}@2x.png`);
  if (!fs.existsSync(base)) return;
  const img = nativeImage.createFromPath(base);
  if (fs.existsSync(retina)) {
    img.addRepresentation({ scaleFactor: 2.0, dataURL: nativeImage.createFromPath(retina).toDataURL() });
  }
  app.dock.setIcon(img);
}

function updateTray() {
  if (!tray) return;
  tray.setImage(getTrayIcon(trayState));

  const statusLabel = todayStatus ? `Today: ${todayStatus}` : 'Today: checking…';
  const menu = Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: 'Re-run status check now', click: () => engine?.runCheck(true) },
    { label: 'Open Settings', click: openSettings },
    { label: 'View Logs', click: openLogs },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);

  updateDockIcon(trayState);
}

function setTrayState(state: TrayState, status?: MondayStatus) {
  trayState = state;
  if (status !== undefined) todayStatus = status;
  updateTray();
}

// ─── Window factories ──────────────────────────────────────────────────────

function createWindow(page: string, opts: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: 640,
    height: 580,
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    ...opts,
  });

  const isDev = process.env.NODE_ENV === 'development';
  const htmlPath = isDev
    ? path.join(app.getAppPath(), `dist/renderer/${page}.html`)
    : path.join(app.getAppPath(), `dist/renderer/${page}.html`);
  win.loadFile(htmlPath);
  win.once('ready-to-show', () => win.show());
  return win;
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = createWindow('settings', { title: 'Settings — DontAskWhereIAm' });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function openWizard() {
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.focus();
    return;
  }
  wizardWindow = createWindow('wizard', { title: 'Setup — DontAskWhereIAm', width: 700, height: 620 });
  wizardWindow.on('closed', () => { wizardWindow = null; });
}

export function openBoardPicker(boards: { id: string; name: string }[], expectedName: string) {
  if (boardPickerWindow && !boardPickerWindow.isDestroyed()) {
    boardPickerWindow.focus();
    return;
  }
  boardPickerWindow = createWindow('board-picker', { title: 'Select Board', width: 520, height: 420 });
  boardPickerWindow.webContents.once('did-finish-load', () => {
    boardPickerWindow?.webContents.send('init-data', { boards, expectedName });
  });
  boardPickerWindow.on('closed', () => { boardPickerWindow = null; });
}

export function openRowPicker(items: { id: string; name: string }[], boardName: string) {
  if (rowPickerWindow && !rowPickerWindow.isDestroyed()) {
    rowPickerWindow.focus();
    return;
  }
  rowPickerWindow = createWindow('row-picker', { title: 'Select Your Row', width: 520, height: 420 });
  rowPickerWindow.webContents.once('did-finish-load', () => {
    rowPickerWindow?.webContents.send('init-data', { items, boardName });
  });
  rowPickerWindow.on('closed', () => { rowPickerWindow = null; });
}

function openLogs() {
  shell.openPath(getLogDir());
}

// ─── Engine event handler ──────────────────────────────────────────────────

function handleEngineEvent(event: EngineEvent) {
  const log = getLogger();

  switch (event.type) {
    case 'status-updated':
      log.info(`Status updated: ${event.status}`);
      setTrayState('green', event.status);
      if (getSettings().showNotifications) {
        new Notification({
          title: 'DontAskWhereIAm',
          body: `Status updated: ${event.status}`,
        }).show();
      }
      break;

    case 'no-change':
      log.info(`No change: ${event.reason}`);
      if (trayState === 'grey') setTrayState('green', engine?.getState().currentStatus ?? undefined);
      break;

    case 'weekend':
      setTrayState('grey');
      tray?.setToolTip('Weekend — no update needed');
      break;

    case 'board-not-found':
      log.warn(`Board not found: ${event.expectedName}`);
      setTrayState('orange');
      if (getSettings().showNotifications) {
        const n = new Notification({
          title: 'Board not found',
          body: `"${event.expectedName}" not found. Click to select manually.`,
        });
        n.on('click', () => openBoardPicker(event.boards, event.expectedName));
        n.show();
      } else {
        openBoardPicker(event.boards, event.expectedName);
      }
      break;

    case 'row-not-found':
      log.warn(`Employee row not found in board ${event.boardId}`);
      setTrayState('orange');
      if (getSettings().showNotifications) {
        const n = new Notification({
          title: 'Row not found',
          body: `Your row was not found in "${event.boardName}". Click to select manually.`,
        });
        n.on('click', () => openRowPicker(event.items, event.boardName));
        n.show();
      } else {
        openRowPicker(event.items, event.boardName);
      }
      break;

    case 'week-not-found':
      log.error(`Week tab not found for today in board ${event.boardId}`);
      setTrayState('red');
      new Notification({
        title: 'Board incomplete',
        body: `No week covering today's date was found. Please check the board on Monday.com.`,
      }).show();
      break;

    case 'error':
      log.error(`Engine error: ${event.message}`);
      setTrayState('red');
      new Notification({
        title: 'DontAskWhereIAm error',
        body: event.message,
      }).show();
      break;

    case 'needs-auth':
      setTrayState('red');
      new Notification({
        title: 'Sign-in required',
        body: 'Monday.com session expired. Click to sign in again.',
      }).show();
      openWizard();
      break;
  }
}

// ─── Polling & midnight reset ──────────────────────────────────────────────

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  const settings = getSettings();
  const interval = (settings.pollingIntervalMinutes || config.pollingIntervalMinutes) * 60 * 1000;
  pollInterval = setInterval(() => engine?.runCheck(), interval);
  getLogger().info(`Polling started — interval: ${interval / 60000} min`);
}

function scheduleMidnightReset() {
  if (midnightTimeout) clearTimeout(midnightTimeout);
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 5, 0); // 00:00:05 next day
  const msUntilMidnight = midnight.getTime() - now.getTime();

  midnightTimeout = setTimeout(() => {
    getLogger().info('Midnight reset triggered');
    engine?.resetForNewDay();
    engine?.runCheck();
    scheduleMidnightReset(); // schedule next midnight
  }, msUntilMidnight);
}

// ─── OAuth redirect interception ───────────────────────────────────────────

import * as http from 'http';

/**
 * Open the Monday.com OAuth sign-in URL in the user's default system browser.
 * Spins up a temporary HTTP server on the redirect URI's port to catch the
 * ?code= callback, then tears itself down.
 */
export function openMondayOAuthWindow(authUrl: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  return new Promise((resolve) => {
    const redirectUri = config.monday.redirectUri;
    const port = Number(new URL(redirectUri).port) || 80;
    let settled = false;

    function finish(result: { ok: boolean; name?: string; error?: string }) {
      if (settled) return;
      settled = true;
      server.close();
      resolve(result);
    }

    const callbackPath = new URL(redirectUri).pathname;
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url!, `http://localhost:${port}`);

      // Ignore any request that isn't the callback (e.g. /favicon.ico)
      if (reqUrl.pathname !== callbackPath) {
        res.writeHead(204);
        res.end();
        return;
      }

      const code  = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<html><body style="font-family:-apple-system,sans-serif;padding:48px 40px;max-width:480px">` +
          `<h2 style="color:#b91c1c">Sign-in failed</h2>` +
          `<p style="color:#57606a">${error}</p>` +
          `<p style="color:#57606a;font-size:13px">You can close this tab and try again.</p>` +
          `</body></html>`
        );
        finish({ ok: false, error: `Monday.com error: ${error}` });
      } else if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<html><head><title>DontAskWhereIAm</title></head>` +
          `<body style="font-family:-apple-system,sans-serif;padding:48px 40px;max-width:480px;text-align:center">` +
          `<div style="font-size:48px;margin-bottom:16px">✅</div>` +
          `<h2 style="margin:0 0 8px;color:#1f2328">Signed in to Monday.com</h2>` +
          `<p style="color:#57606a;margin:0 0 24px">You're connected. You can close this tab and return to the app.</p>` +
          `<p style="font-size:12px;color:#8b949e">This tab will close automatically.</p>` +
          `<script>setTimeout(()=>window.close(),1500)</script>` +
          `</body></html>`
        );
        exchangeMondayCode(code, config)
          .then(finish)
          .catch((err: unknown) => finish({ ok: false, error: String(err) }));
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<html><body style="font-family:-apple-system,sans-serif;padding:48px 40px">` +
          `<h2 style="color:#b91c1c">Something went wrong</h2>` +
          `<p style="color:#57606a">No authorisation code was received. Please close this tab and try again.</p>` +
          `</body></html>`
        );
        finish({ ok: false, error: 'No code in callback' });
      }
    });

    server.on('error', (err: Error) => {
      finish({ ok: false, error: `Callback server error: ${err.message}` });
    });

    server.listen(port, '127.0.0.1', () => {
      shell.openExternal(authUrl);
    });

    // Time-out after 5 minutes in case the user abandons the browser
    setTimeout(() => finish({ ok: false, error: 'Sign-in timed out' }), 5 * 60 * 1000);
  });
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Load config now that app is ready
  const CONFIG_PATH = path.join(app.getAppPath(), 'config.json');
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  // Init
  loadSettings();
  initLogger(config);
  const log = getLogger();
  log.info('DontAskWhereIAm starting up');

  // Launch at login
  if (getSettings().launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  // Load bank holidays
  await loadHolidays(config);

  // Create tray
  tray = new Tray(getTrayIcon('grey'));
  tray.setToolTip('DontAskWhereIAm');
  updateTray();

  // Setup IPC
  setupIpcHandlers(ipcMain, config, {
    openSettings,
    openWizard,
    openBoardPicker,
    openRowPicker,
    openMondayOAuthWindow,
    runCheck: () => engine?.runCheck(true),
    closeSettings: () => settingsWindow?.close(),
    closeWizard: () => { wizardWindow?.close(); startAfterSetup(); },
    closeBoardPicker: () => boardPickerWindow?.close(),
    closeRowPicker: () => rowPickerWindow?.close(),
  });

  // If first run — open wizard; otherwise start engine
  if (!getSettings().isSetupComplete) {
    openWizard();
  } else {
    startAfterSetup();
  }
});

function startAfterSetup() {
  engine = new StatusEngine(config, handleEngineEvent);
  engine.runCheck();
  startPolling();
  scheduleMidnightReset();
}

// Prevent app from quitting when all windows are closed (tray app)
app.on('window-all-closed', (e: Event) => e.preventDefault());

app.on('before-quit', () => {
  if (pollInterval) clearInterval(pollInterval);
  if (midnightTimeout) clearTimeout(midnightTimeout);
});
