# DontAskWhereIAm

> _"An app that figures out where you are so you don't have to explain yourself."_

A cross-platform desktop app (macOS, Windows, Linux) that automatically updates your Monday.com attendance board based on your Wi-Fi connection, Outlook calendar, and Irish public holidays — with zero manual effort.

---

## How it works

| Detection | Status |
|---|---|
| Connected to IBM Wi-Fi (primary or guest) at any point today | `Office` |
| All-day leave event in your selected Outlook calendar | `Vacation` |
| Irish public holiday | `Bank Holiday` |
| None of the above | `WFH` |

**Office always wins** — if you connect to IBM Wi-Fi at any point during the day, the status is set to `Office` and stays that way regardless of what happens later. Manual statuses (`WFH: Sickness`, `LOA`, `Travel`, etc.) are never touched by the app, unless IBM Wi-Fi is detected.

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Install dependencies
```bash
cd DontAskWhereIAm
npm install
```

### Build
```bash
npm run build
```

### Run (development)
```bash
npm start
```

### Package for distribution
```bash
npm run dist:mac     # → release/*.dmg
npm run dist:win     # → release/*.exe
npm run dist:linux   # → release/*.AppImage
```

---

## First-time setup

On first launch, the setup wizard will guide you through:

1. **Azure Client ID** — Register a free Azure app at [portal.azure.com](https://portal.azure.com), grant `Calendars.Read` and `User.Read` permissions, and paste the Client ID here.
2. **Sign in with Microsoft** — Authenticate your Outlook account.
3. **Select your holiday calendar** — Choose the calendar that contains your leave events.
4. **Monday.com API token** — Generate one from your Monday.com profile → Admin → API.
5. **Board name prefix** — e.g. `David Gill NMI` (the app appends the month + year automatically).
6. **Your name on the board** — Exactly as it appears in Monday.com.
7. **(Optional)** Confirm Wi-Fi SSIDs if they differ from the defaults (`IBM Wifi` / `IBM Wifi Guest`).

After setup, the app runs silently in your system tray.

---

## Project structure

```
DontAskWhereIAm/
├── config.json                        ← App-wide constants (SSIDs, polling interval, etc.)
├── src/
│   ├── main/                          ← Electron main process (Node.js)
│   │   ├── main.ts                    ← Entry point, tray, windows, lifecycle
│   │   ├── engine.ts                  ← Core status decision logic
│   │   ├── ipc.ts                     ← IPC handlers (main ↔ renderer)
│   │   ├── preload.ts                 ← Context bridge (exposes window.api)
│   │   ├── store.ts                   ← User settings persistence
│   │   ├── logger.ts                  ← Winston logger with daily rotation
│   │   ├── types.ts                   ← Shared TypeScript types
│   │   └── services/
│   │       ├── wifiService.ts         ← Wi-Fi SSID detection (node-wifi)
│   │       ├── holidayService.ts      ← Irish bank holidays (Nager.Date API + fallback)
│   │       ├── calendarService.ts     ← Outlook OAuth2 + leave event detection
│   │       └── mondayService.ts       ← Monday.com GraphQL API
│   └── renderer/                      ← React UI (runs in Electron BrowserWindows)
│       ├── shared/api.d.ts            ← Shared window.api type declaration
│       ├── settings/                  ← Settings page
│       ├── wizard/                    ← First-run setup wizard
│       ├── board-picker/              ← Fallback board selector
│       └── row-picker/                ← Fallback employee row selector
├── assets/                            ← Tray icons, app icons
├── dist/                              ← Compiled output (gitignored)
└── release/                           ← Packaged installers (gitignored)
```

---

## Configuration

Edit `config.json` to change defaults (can also be overridden in the Settings UI):

```json
{
  "ibmWifi": {
    "primarySSID": "IBM Wifi",
    "guestSSID": "IBM Wifi Guest"
  },
  "pollingIntervalMinutes": 5,
  "bankHolidayCountryCode": "IE",
  "logRetentionDays": 7
}
```

---

## Monday.com Board Structure

The app expects boards named in the pattern:
```
{prefix} {Month} Attendance {Year}
```
e.g. `David Gill NMI Sept Attendance 2026`

Each board has week tabs (`Week 1`–`Week 5`) with rows per employee. Each row has `Week Start`, `Week End`, and day columns (`Monday`–`Friday`). The app resolves the correct board, week, and column automatically from today's date.

---

## Logs

Logs are stored at:
- **macOS:** `~/Library/Application Support/dontaskwhereiam/logs/`
- **Windows:** `%APPDATA%\dontaskwhereiam\logs\`
- **Linux:** `~/.config/dontaskwhereiam/logs/`

Access them via tray → **View Logs**.

---

## Tech stack

| | |
|---|---|
| Framework | Electron 28 |
| Language | TypeScript 5 |
| UI | React 18 |
| Wi-Fi | node-wifi |
| Calendar | Microsoft Graph API + @azure/msal-node |
| Monday.com | GraphQL API |
| Secure storage | keytar (OS keychain) |
| Bank holidays | date.nager.at + local fallback |
| Logging | winston + winston-daily-rotate-file |
| Packaging | electron-builder |
