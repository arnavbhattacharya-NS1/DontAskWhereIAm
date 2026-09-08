import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (partial: Record<string, unknown>) => ipcRenderer.invoke('save-settings', partial),

  // Outlook Calendar (ICS — no OAuth required)
  testIcsUrl: (url: string) => ipcRenderer.invoke('test-ics-url', url),
  saveIcsUrl: (url: string) => ipcRenderer.invoke('save-ics-url', url),
  openIcsFileDialog: () => ipcRenderer.invoke('open-ics-file-dialog'),
  saveIcsFilePath: (path: string) => ipcRenderer.invoke('save-ics-file-path', path),
  saveLeaveDates: (dates: Array<{ from: string; to: string; label: string }>) =>
    ipcRenderer.invoke('save-leave-dates', dates),

  // Monday.com — OAuth
  mondayOAuthStart: () => ipcRenderer.invoke('monday-oauth-start'),

  // Monday.com Data
  fetchBoards: () => ipcRenderer.invoke('fetch-boards'),
  saveBoardOverride: (key: string, boardId: string, remember: boolean) =>
    ipcRenderer.invoke('save-board-override', key, boardId, remember),
  saveRowSelection: (name: string) => ipcRenderer.invoke('save-row-selection', name),

  // Engine
  runCheck: () => ipcRenderer.invoke('run-check'),

  // Window controls
  closeSettings: () => ipcRenderer.invoke('close-settings'),
  closeWizard: () => ipcRenderer.invoke('close-wizard'),
  closeBoardPicker: (boardId: string, remember: boolean, expectedName: string) =>
    ipcRenderer.invoke('close-board-picker', boardId, remember, expectedName),
  closeRowPicker: (name: string) => ipcRenderer.invoke('close-row-picker', name),

  // Listeners
  onInitData: (cb: (data: unknown) => void) => {
    ipcRenderer.on('init-data', (_evt, data) => cb(data));
  },
});
