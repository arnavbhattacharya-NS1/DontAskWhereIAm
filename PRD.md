# Product Requirements Document — DontAskWhereIAm

> _"An app that figures out where you are so you don't have to explain yourself."_

**Version:** 1.2 (Final Draft)
**Status:** In Discussion
**Last Updated:** 2025

---

## 1. Overview

**DontAskWhereIAm** is a cross-platform desktop application (macOS, Windows, Linux) built with Electron. It runs silently in the background and automatically determines a user's work status each day — based on Wi-Fi network, Outlook calendar events, and Irish public holidays — and updates the correct cell in the correct Monday.com board, week tab, and day column, all resolved automatically from today's date. The goal is zero manual effort: the app starts at login, runs in the background, and handles the update without the user ever opening it.

---

## 2. Problem Statement

Employees are required to keep a Monday.com board up to date with their daily work location status. This is a repetitive, low-value manual task that is frequently forgotten or done incorrectly. **DontAskWhereIAm** automates this completely.

---

## 3. Goals & Non-Goals

### Goals
- Automatically detect and push work status to Monday.com each working day
- Automatically resolve the correct board (by month), the correct week tab, and the correct day column from today's date — no manual selection needed after initial setup
- Handle all status scenarios: Office, WFH, Vacation, Bank Holiday (auto); leave manual statuses untouched
- Run silently in the system tray from login — the user never needs to open the app
- Be easy to download and run locally on macOS, Windows, and Linux with no developer setup
- Respect the "Office always wins" rule — IBM Wi-Fi detection is the only thing that can overwrite any status, including manual ones
- Fetch the current cell value from Monday.com before deciding whether to act

### Non-Goals
- This app does NOT track the user's physical location beyond Wi-Fi SSID
- This app does NOT modify the calendar or create calendar events
- This app does NOT support calendars other than Outlook (v1)
- This app does NOT support holiday lists outside of Ireland (v1)
- This app does NOT auto-set manual statuses (`WFH: Sickness`, `WFH: Unplanned Issues`, `LOA`, `Travel`)

---

## 4. Users

- IBM employees based in Ireland who are required to maintain a daily location status on a Monday.com board
- Non-technical users: the app must be downloadable and runnable without any developer setup (no Node, no terminal commands)

---

## 5. Monday.com Board Structure

Understanding the board structure is fundamental to how the app navigates and updates Monday.com.

### 5.1 Structure Overview

| Level | Example | How it maps to date |
|---|---|---|
| **Workspace** | `IBM Software Attendance 2026` | Fixed — selected once in Settings |
| **Board** | `David Gill NMI Sept Attendance 2026` | One board per calendar month |
| **Tab (View)** | `Week 1`, `Week 2` … `Week 5` | One tab per week of that month |
| **Row (Item)** | `Arnav Bhattacharya` | One row per employee — fixed |
| **Column** | `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday` | Maps to the day of the week |

Each board also contains the following read/computed columns per row:
`Week Start`, `Week End`, `Office days`, `WFH days`, `Attendance (%)`, `Compliant Review`, `Location`

The app only **reads and writes** the day columns (`Monday`–`Friday`).

### 5.2 Board Naming Pattern

Boards follow a consistent naming pattern that the app uses to identify the correct board for any given date:

```
{Prefix} {Month} Attendance {Year}
```

Example: `David Gill NMI Sept Attendance 2026`

In Settings, the user provides:
- The **board name prefix** (e.g. `David Gill NMI`) — everything before the month token
- The **year** is taken from the current system date automatically

The app constructs the target board name as:
```
{prefix} {MMM} Attendance {YYYY}
```
Where `{MMM}` is the 3-letter month abbreviation (Jan, Feb, Mar … Dec).

### 5.3 Week Tab Resolution

Each board has tabs named `Week 1` through `Week 5`. The app determines the correct week tab by:

1. Fetching all items in the board (across all week tabs)
2. Each row has a `Week Start` and `Week End` date column
3. The app finds the row where `Week Start ≤ today ≤ Week End` — that row's tab is the target week
4. Within that tab, the app locates the row matching the employee's name

### 5.4 Fallback — Board Not Found

If the auto-constructed board name does not match any board in the user's Monday.com account:

1. The app sends a desktop notification: _"Board for [Month Year] not found. Click to select manually."_
2. Clicking the notification (or the tray icon) opens a **Board Picker window** — a simple list of all boards fetched from the user's Monday.com account
3. The user selects the correct board from the list
4. The app asks: _"Remember this as the board for [Month Year]?"_
   - If **Yes** → the selection is saved as a permanent override for that month in local settings; the auto-naming pattern is bypassed for this month going forward
   - If **No** → the selection is used for today only; the app will ask again tomorrow
5. The app immediately proceeds with the status check using the selected board

**Override storage:** Manual board overrides are stored per `{prefix}-{YYYY-MM}` key in local settings (e.g. `david-gill-nmi-2026-09 → boardId:xxxxx`). Auto-resolution always checks for an override first before attempting pattern matching.

### 5.5 Fallback — Employee Row Not Found

If the employee name in Settings does not match any row in the resolved board:

1. The app sends a notification: _"Your row was not found in [Board Name]. Click to select manually."_
2. Clicking opens a **Row Picker window** — lists all employee rows (items) in the board
3. The user selects their row
4. The selection is saved permanently in Settings as the canonical employee row name (overwriting the previously entered name)
5. The app immediately proceeds with the status check using the selected row

### 5.6 Day Column Resolution

Today's day of the week maps directly to a column name:

| Day | Column |
|---|---|
| Monday | `Monday` |
| Tuesday | `Tuesday` |
| Wednesday | `Wednesday` |
| Thursday | `Thursday` |
| Friday | `Friday` |

### 5.7 Fetch-Before-Write

The app **always fetches the current value** of the target cell before deciding what to do:

| Current cell value | App action |
|---|---|
| `""` (blank / empty) | Cell is "not yet set" — run full status logic and write the result |
| `Office` | Already correct — do nothing |
| `WFH` | Check IBM Wi-Fi: if detected → overwrite with `Office`; otherwise → do nothing |
| `Bank Holiday` or `Vacation` | Already set by prior check — do nothing |
| `WFH: Sickness`, `WFH: Unplanned Issues`, `LOA`, `Travel` | Manual status — do nothing (unless IBM Wi-Fi is detected → overwrite with `Office`) |

---

## 6. Status Logic

### 6.1 Status Types

There are two categories of status:

#### Auto-managed statuses (set by the app)
| Status | Monday.com Label |
|---|---|
| Office | `Office` |
| WFH | `WFH` |
| Vacation | `Vacation` |
| Bank Holiday | `Bank Holiday` |

#### Manual-only statuses (never set by the app; only overwritten if IBM Wi-Fi is detected)
| Status | Monday.com Label |
|---|---|
| WFH: Sickness | `WFH: Sickness` |
| WFH: Unplanned Issues | `WFH: Unplanned Issues` |
| Leave of Absence | `LOA` |
| Travel | `Travel` |
| Not yet set | `""` (blank — the default starting value for every cell, every day) |

> Every cell starts as blank at the beginning of each day. The app treats blank as "not yet set" and proceeds with its normal logic.

### 6.2 The "Office Always Wins" Rule

> **If the user connects to IBM Wi-Fi (primary or guest) at any point during a given day, the status is immediately set to `Office` and cannot be changed by anything or anyone else for the rest of that day.**
>
> IBM Wi-Fi detection is the **only** thing that can overwrite a manually set status.

### 6.3 Daily Status Decision Logic

The app runs this flow every polling cycle (and on startup):

```
Step 1 — Is today a weekend (Saturday or Sunday)?
   YES → Do nothing. STOP.

Step 2 — Fetch the current value of today's cell from Monday.com.

Step 3 — Is IBM Wi-Fi (primary or guest SSID) currently connected?
   YES → Is the current cell value already "Office"?
            YES → Do nothing. STOP.
            NO  → Write "Office" to the cell. Lock day. STOP.

Step 4 — Has IBM Wi-Fi been detected and written at any earlier point today (in-memory flag)?
   YES → Do nothing (Office is already set or will be next cycle). STOP.

Step 5 — Is the current cell value a manual-only status (non-blank, non-auto)?
   YES → Leave it untouched. STOP.

Step 6 — Is today an Irish bank holiday?
   YES → Is the current cell value already "Bank Holiday"?
            YES → Do nothing. STOP.
            NO  → Write "Bank Holiday". STOP.

Step 7 — Does the selected Outlook calendar have an all-day leave event today?
   YES → Is the current cell value already "Vacation"?
            YES → Do nothing. STOP.
            NO  → Write "Vacation". STOP.

Step 8 — Default.
   Is the current cell value already "WFH"?
      YES → Do nothing. STOP.
      NO  → Write "WFH". STOP.
```

### 6.4 The WFH → Office Mid-Day Upgrade

- User starts at home → app writes `WFH` on first morning check
- User later arrives at the office and connects to IBM Wi-Fi
- Next polling cycle detects IBM Wi-Fi → **overwrites `WFH` with `Office`**
- Day is locked as `Office` — even if the user disconnects and goes home later

### 6.5 Daily Reset

- At midnight, the app resets:
  - The in-memory `ibmWifiDetectedToday` flag
  - The in-memory `statusLockedToday` flag
- A fresh status check runs immediately after reset (skipped if it is a weekend)

---

## 7. Features

### 7.1 Background Operation

- The app launches at system login automatically (configurable in Settings)
- After first-time setup, the app runs **entirely in the background** — no window opens on launch
- The only user-visible element is the system tray icon
- The user never needs to open or interact with the app on a normal working day

### 7.2 Configuration File

A `config.json` file (bundled with the app and editable by advanced users) holds constants that rarely change:

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

> The SSID values in `config.json` serve as defaults. The user can also override them in the Settings UI without editing the file directly.

### 7.3 Wi-Fi Detection

- The app reads the currently connected Wi-Fi SSID using OS-native calls via `node-wifi`
- The app checks for **both** the primary IBM SSID and the IBM Guest SSID
- If either SSID is matched, the Office rule applies
- Polls at the interval defined in `config.json` (default: every 5 minutes)
- Works on macOS, Windows, and Linux without requiring elevated permissions

### 7.4 Monday.com Integration

- Connects via the **Monday.com GraphQL API** using a personal API token
- The personal API token is entered once in Settings and stored securely in the OS keychain
- On each check cycle, the app:
  1. Constructs the target board name from the prefix + current month + year
  2. Fetches all items in that board to find the correct week tab (by `Week Start` / `Week End`)
  3. Locates the employee's row by name
  4. Reads the value of today's day column
  5. Applies the decision logic (§6.3)
  6. Writes the new value only if a change is needed
- The user configures in Settings:
  - **Monday.com personal API token**
  - **Board name prefix** (e.g. `David Gill NMI`) — month and year are appended automatically
  - **Employee name** (as it appears on the board, e.g. `Arnav Bhattacharya`) — used to locate the correct row

### 7.5 Outlook Calendar Integration

- Connects to Microsoft 365 / Outlook via **Microsoft Graph API** using OAuth 2.0
- Each user registers their own Azure application and provides the Client ID in Settings
- Authentication is done once via a browser popup; access token stored in OS keychain via `keytar`
- After authentication, the app fetches the user's full calendar list → user selects one in Settings
- The app reads all-day events from the selected calendar for the current date on each daily check
- A configurable list of event title keywords identifies a leave event (e.g. `Leave`, `Annual Leave`, `Holiday`, `PTO`, `Vacation`) — editable in Settings
- The user's identity is taken from the signed-in Microsoft account's display name/email

### 7.6 Irish Bank Holiday Detection

- Fetched from [Nager.Date public API](https://date.nager.at/api/v3/PublicHolidays) for country code `IE` at app startup
- Cached locally for the current calendar year; refreshed at the start of each new year
- Falls back to a locally bundled holiday list if the API is unreachable

### 7.7 System Tray

- The app lives entirely in the system tray after setup
- Tray icon states:

| State | Meaning |
|---|---|
| Grey | Status not yet determined today |
| Green | Status successfully updated today |
| Orange | Non-critical issue (e.g. bank holiday API unreachable, used local fallback) |
| Red | Critical error (e.g. Monday.com token invalid, OAuth expired, week tab not found) |

- Tray right-click menu:
  - `Today: {current status}` (read-only label)
  - `Re-run status check now`
  - `Open Settings`
  - `View Logs`
  - `Quit`

#### Re-run behaviour
- Triggers the full decision flow immediately (§6.3)
- Office lock is always respected — a re-run cannot downgrade an existing `Office` status
- A manually set status is preserved unless IBM Wi-Fi is detected during the re-run

### 7.8 Settings Page

The Settings page is the only configurable UI window.

#### Microsoft / Outlook
- Azure Client ID (text field)
- Sign in with Microsoft (OAuth button)
- Signed-in account (name + email, read-only after login)
- Select Holiday Calendar (dropdown, populated after sign-in)
- Leave event keywords (comma-separated, e.g. `Leave, Annual Leave, Holiday, PTO, Vacation`)

#### Wi-Fi
- IBM Wi-Fi Primary SSID (text field, default: `IBM Wifi`)
- IBM Wi-Fi Guest SSID (text field, default: `IBM Wifi Guest`)
- Polling interval in minutes (number, default: `5`)

#### Monday.com
- Personal API Token (password field)
- Board name prefix (text field, e.g. `David Gill NMI`) — month + year appended automatically
- Employee name on board (text field, e.g. `Arnav Bhattacharya`)

#### General
- Launch at login (checkbox, default: on)
- Show desktop notification when status is updated (checkbox, default: on)

### 7.9 First-Run Wizard

On first launch, a setup wizard guides the user through:

1. Enter Azure Client ID → Microsoft OAuth browser popup → sign in
2. Select holiday calendar from the fetched calendar list
3. Enter Monday.com personal API token
4. Enter board name prefix and employee name
5. (Optional) confirm or change Wi-Fi SSIDs
6. Done — wizard closes, app minimises to tray

### 7.10 Logging

- Local log file at `{userData}/logs/app.log`
- Timestamped entries: Wi-Fi changes, calendar check results, bank holiday results, Monday.com API calls/responses, errors
- Accessible via tray → `View Logs` (opens in default text editor)
- Auto-rotates: retains last `logRetentionDays` days (default: 7, from `config.json`)

---

## 8. Platform Support

| Platform | Minimum Version | Installer Format |
|---|---|---|
| macOS | 11 (Big Sur) | `.dmg` |
| Windows | 10 | `.exe` (NSIS installer) |
| Linux | Ubuntu 20.04+ / any systemd distro | `.AppImage` |

---

## 9. Tech Stack

| Layer | Technology |
|---|---|
| App framework | Electron (latest stable) |
| Language | TypeScript |
| UI (Settings / Wizard) | React + TailwindCSS |
| Wi-Fi detection | `node-wifi` |
| Calendar | Microsoft Graph API (OAuth 2.0 via `@azure/msal-node`) |
| Monday.com | GraphQL API (`axios`) |
| Secure storage | `keytar` (OS keychain) |
| Bank holidays | `date.nager.at` public API + local fallback JSON |
| Configuration | `config.json` (bundled, editable) |
| Packaging | `electron-builder` |
| Auto-update | `electron-updater` (GitHub Releases) |
| Logging | `winston` |

---

## 10. Security & Privacy

- No user data is sent to any server other than Microsoft Graph and Monday.com
- OAuth tokens and API keys are stored exclusively in the OS-native keychain — never in plain-text files
- Wi-Fi SSID data is used only for local comparison — never transmitted externally
- Calendar event content is never stored or transmitted; the app only checks whether a leave keyword appears in an event title on the current date

---

## 11. Error Handling

| Scenario | Behaviour |
|---|---|
| No internet connection | Retry on next poll; tray goes orange |
| Monday.com API token invalid or expired | Tray goes red; notification prompts user to update token in Settings |
| Target board not found (auto-resolution) | Notification prompts user to pick board manually; selection remembered permanently for that month (§5.4) |
| Employee row not found in board | Notification prompts user to pick their row manually; selection saved permanently in Settings (§5.5) |
| Week tab not found (date out of range) | Tray goes red; notification — "No week tab found covering today's date in [Board Name]" |
| Microsoft OAuth token expired | App silently refreshes; if refresh fails, tray goes red and prompts re-authentication |
| Wi-Fi polling fails | Log the error; retry on next interval |
| Bank holiday API unreachable | Fall back to locally bundled list; tray goes orange |
| App launched on a weekend | No check performed; tray shows grey with tooltip "Weekend — no update needed" |

---

## 12. Out of Scope (v1)

- Google Calendar support
- Non-Irish public holiday lists
- Multiple employee rows (each user runs their own instance)
- Team-level dashboards or admin view
- Mobile app
- Browser extension

---

## 13. Resolved Questions

| Question | Answer |
|---|---|
| IBM Wi-Fi SSIDs | Primary: `IBM Wifi`, Guest: `IBM Wifi Guest` (in `config.json`, overridable in Settings) |
| Monday.com column labels | `Office`, `WFH`, `Vacation`, `Bank Holiday` (auto) + `WFH: Sickness`, `WFH: Unplanned Issues`, `LOA`, `Travel`, `""` (manual/blank) |
| Blank cell meaning | Default starting value — treated as "not yet set"; app applies normal auto-logic |
| Board/week/day navigation | Fully automatic from today's date using board name prefix pattern + `Week Start`/`Week End` columns |
| Skip weekends? | Yes — no checks or updates on Saturday or Sunday |
| First launch mid-day? | Yes — run the full check immediately on launch |
| Azure app registration | Each user registers their own Azure app and provides their Client ID in Settings |
| User identity on Monday.com | Employee name entered manually in Settings; used to locate the correct row |
| Manual override behaviour | Manual statuses are never touched unless IBM Wi-Fi is detected (which always writes `Office`) |
| "Re-run now" and Office lock | Office lock always respected; re-run cannot downgrade an already-set `Office` status |
| Fetch before write | Yes — app always reads the current cell value before deciding whether to act |

---

## 14. Success Metrics (v1)

- User completes first-time setup in under 5 minutes
- Status is updated on Monday.com on all working days with zero manual action
- Zero false downgrades from Office → WFH on days the user visits the office
- App correctly navigates to the right board, week tab, and day column 100% of the time
- App uses < 100 MB RAM while idle in the background
- Installer size < 150 MB on all platforms
