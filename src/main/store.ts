import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { UserSettings } from './types';

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

const DEFAULT_SETTINGS: UserSettings = {
  // Outlook calendar (ICS)
  icsUrl: '',
  icsFilePath: '',
  leaveKeywords: ['Leave', 'Annual Leave', 'PTO', 'Vacation', 'Holiday'],
  leaveDates: [],
  // Wi-Fi
  primarySSID: '',
  guestSSID: '',
  pollingIntervalMinutes: 0,
  // Monday.com — OAuth
  mondayAccessToken: '',
  mondayRefreshToken: '',
  mondayTokenExpiry: 0,
  mondayUserId: '',
  boardNamePrefix: '',
  employeeName: '',
  boardOverrides: {},
  // General
  launchAtLogin: true,
  showNotifications: true,
  isSetupComplete: false,
};

let _settings: UserSettings = { ...DEFAULT_SETTINGS };

export function loadSettings(): UserSettings {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      _settings = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.error('Failed to load settings, using defaults:', err);
    _settings = { ...DEFAULT_SETTINGS };
  }

  // One-shot migration: old "mondayApiToken" field → mondayAccessToken
  const legacy = _settings as unknown as Record<string, unknown>;
  if (legacy.mondayApiToken && !_settings.mondayAccessToken) {
    _settings.mondayAccessToken = legacy.mondayApiToken as string;
    saveSettings({ mondayAccessToken: _settings.mondayAccessToken });
  }
  return _settings;
}

export function saveSettings(partial: Partial<UserSettings>): void {
  _settings = { ..._settings, ...partial };
  const p = getSettingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(_settings, null, 2), 'utf-8');
}

export function getSettings(): UserSettings {
  return _settings;
}
