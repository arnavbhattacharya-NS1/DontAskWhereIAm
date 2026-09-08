// Shared types across the entire app

export interface AppConfig {
  ibmWifi: {
    primarySSID: string;
    guestSSID: string;
  };
  pollingIntervalMinutes: number;
  bankHolidayCountryCode: string;
  logRetentionDays: number;
  monday: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
}

/** A manually-entered leave date range */
export interface LeaveDateRange {
  from: string; // "YYYY-MM-DD" inclusive
  to: string;   // "YYYY-MM-DD" inclusive
  label: string; // e.g. "Annual Leave", "Sick", "Holiday"
}

export interface UserSettings {
  // Outlook calendar — iCalendar source (URL or local file path, no OAuth required)
  icsUrl: string;       // live Outlook ICS URL (preferred — always up to date)
  icsFilePath: string;  // local .ics file path (fallback — exported from Outlook desktop)
  leaveKeywords: string[]; // e.g. ['Leave', 'Annual Leave', 'PTO', 'Vacation', 'Holiday']

  // Manual leave dates — entered directly in the app (works when calendar access is unavailable)
  leaveDates: LeaveDateRange[];

  // Wi-Fi overrides (override config.json defaults)
  primarySSID: string;
  guestSSID: string;
  pollingIntervalMinutes: number;

  // Monday.com — OAuth tokens (obtained via "Sign in with Monday.com" flow)
  mondayAccessToken: string;   // short-lived access token
  mondayRefreshToken: string;  // long-lived refresh token
  mondayTokenExpiry: number;   // Unix ms timestamp when access token expires
  mondayUserId: string;        // Monday.com user ID (from /me after auth)
  boardNamePrefix: string;     // e.g. "David Gill NMI"
  employeeName: string;        // e.g. "Arnav Bhattacharya"

  // Board overrides: key = "{prefix}-{YYYY-MM}", value = boardId
  boardOverrides: Record<string, string>;

  // General
  launchAtLogin: boolean;
  showNotifications: boolean;

  // Setup state
  isSetupComplete: boolean;
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';

// All possible Monday.com status values
export const AUTO_STATUSES = ['Office', 'WFH', 'Vacation', 'Bank holiday'] as const;
export const MANUAL_STATUSES = ['WFH: Sickness', 'WFH: Unplanned Issues', 'LOA', 'Travel'] as const;
export const ALL_STATUSES = [...AUTO_STATUSES, ...MANUAL_STATUSES, ''] as const;

export type AutoStatus = typeof AUTO_STATUSES[number];
export type ManualStatus = typeof MANUAL_STATUSES[number];
export type MondayStatus = AutoStatus | ManualStatus | '';

export interface BoardItem {
  id: string;
  name: string;
  weekStart: string | null;         // ISO date string
  weekEnd: string | null;           // ISO date string
  columnValues: Record<string, string>;    // columnTitle -> value
  columnIds: Record<string, string>;       // columnTitle -> column ID (for writes)
}

export interface MondayBoard {
  id: string;
  name: string;
}

export interface DailyState {
  date: string;                  // ISO date "YYYY-MM-DD"
  ibmWifiDetectedToday: boolean;
  statusLockedToday: boolean;
  currentStatus: MondayStatus | null;
}
