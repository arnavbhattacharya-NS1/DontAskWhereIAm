import type { IpcMain } from 'electron';
import { saveSettings, getSettings } from './store';
import { fetchAllBoards, getMondayOAuthUrl } from './services/mondayService';
import { testIcsUrl, saveIcsUrl, testIcsFile, saveIcsFilePath } from './services/calendarService';
import type { LeaveDateRange, AppConfig } from './types';

interface WindowActions {
  openSettings: () => void;
  openWizard: () => void;
  openBoardPicker: (boards: { id: string; name: string }[], expectedName: string) => void;
  openRowPicker: (items: { id: string; name: string }[], boardName: string) => void;
  openMondayOAuthWindow: (authUrl: string) => Promise<{ ok: boolean; name?: string; error?: string }>;
  runCheck: () => void;
  closeSettings: () => void;
  closeWizard: () => void;
  closeBoardPicker: () => void;
  closeRowPicker: () => void;
}

export function setupIpcHandlers(
  ipcMain: IpcMain,
  config: AppConfig,
  actions: WindowActions
): void {
  ipcMain.handle('get-settings', () => {
    const s = getSettings();
    // Never send raw tokens to the renderer
    return {
      ...s,
      mondayAccessToken: s.mondayAccessToken ? '••••' : '',
      mondayRefreshToken: s.mondayRefreshToken ? '••••' : '',
    };
  });

  ipcMain.handle('save-settings', (_evt, partial: Record<string, unknown>) => {
    const filtered = { ...partial };
    if (filtered.mondayAccessToken === '••••') delete filtered.mondayAccessToken;
    if (filtered.mondayRefreshToken === '••••') delete filtered.mondayRefreshToken;
    saveSettings(filtered as never);
    return true;
  });

  // ── Calendar (ICS) ─────────────────────────────────────────────────────────
  ipcMain.handle('test-ics-url', (_evt, url: string) => {
    return testIcsUrl(url);
  });

  ipcMain.handle('save-ics-url', (_evt, url: string) => {
    saveIcsUrl(url);
    return true;
  });

  ipcMain.handle('open-ics-file-dialog', async (evt) => {
    const { dialog, BrowserWindow: BW } = await import('electron');
    const win = BW.fromWebContents(evt.sender);
    const result = await dialog.showOpenDialog(win ?? { } as never, {
      title: 'Select your Outlook .ics calendar file',
      filters: [{ name: 'iCalendar files', extensions: ['ics'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const testResult = testIcsFile(filePath);
    return { ...testResult, filePath };
  });

  ipcMain.handle('save-ics-file-path', (_evt, filePath: string) => {
    saveIcsFilePath(filePath);
    return true;
  });

  ipcMain.handle('save-leave-dates', (_evt, dates: LeaveDateRange[]) => {
    saveSettings({ leaveDates: dates });
    return true;
  });

  // ── Monday.com OAuth ───────────────────────────────────────────────────────
  ipcMain.handle('monday-oauth-start', async () => {
    const url = getMondayOAuthUrl(config);
    return actions.openMondayOAuthWindow(url);
  });

  ipcMain.handle('fetch-boards', async () => {
    return fetchAllBoards(config);
  });

  ipcMain.handle('save-board-override', (_evt, key: string, boardId: string, remember: boolean) => {
    if (remember) {
      const { boardOverrides } = getSettings();
      saveSettings({ boardOverrides: { ...boardOverrides, [key]: boardId } });
    }
    actions.closeBoardPicker();
    actions.runCheck();
    return true;
  });

  ipcMain.handle('save-row-selection', (_evt, name: string) => {
    saveSettings({ employeeName: name });
    actions.closeRowPicker();
    actions.runCheck();
    return true;
  });

  // ── Engine / Window ────────────────────────────────────────────────────────
  ipcMain.handle('run-check', () => { actions.runCheck(); return true; });
  ipcMain.handle('close-settings', () => { actions.closeSettings(); return true; });

  ipcMain.handle('close-wizard', () => {
    saveSettings({ isSetupComplete: true });
    actions.closeWizard();
    return true;
  });

  ipcMain.handle('close-board-picker', (_evt, boardId: string, remember: boolean, expectedName: string) => {
    if (remember) {
      const settings = getSettings();
      const parts = expectedName.split(' ');
      // expectedName: "{prefix} {MMM} Attendance {YYYY}" — extract month+year
      const year = parts[parts.length - 1];
      const month = parts[parts.length - 3];
      const key = `${settings.boardNamePrefix.toLowerCase().replace(/\s+/g, '-')}-${year}-${month}`;
      const { boardOverrides } = settings;
      saveSettings({ boardOverrides: { ...boardOverrides, [key]: boardId } });
    }
    actions.closeBoardPicker();
    actions.runCheck();
    return true;
  });

  ipcMain.handle('close-row-picker', (_evt, name: string) => {
    saveSettings({ employeeName: name });
    actions.closeRowPicker();
    actions.runCheck();
    return true;
  });
}
