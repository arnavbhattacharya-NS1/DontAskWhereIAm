/**
 * calendarService.ts
 *
 * Reads leave events from one of three sources (tried in order):
 *
 *  Mode A — Live ICS URL (preferred):
 *    A private Outlook calendar URL fetched fresh on every check.
 *
 *  Mode B — Local .ics file (fallback for IBM-managed Outlook):
 *    An .ics file exported from Outlook desktop. User re-exports when
 *    they add new leave.
 *
 *  Mode C — Manual leave dates (always works):
 *    Date ranges entered directly in the app settings.
 *    No calendar access needed at all.
 */

import * as fs from 'fs';
import axios from 'axios';
import { getSettings, saveSettings } from '../store';
import { getLogger } from '../logger';

// ─── ICS parser ──────────────────────────────────────────────────────────────

interface IcsEvent {
  uid: string;
  summary: string;
  dtstart: string;   // raw DTSTART value, e.g. "20260904" or "20260904T090000Z"
  dtend: string;
  isAllDay: boolean;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD" (exclusive in iCal spec, so we use < not <=)
}

/**
 * Minimal iCalendar parser.
 * Handles VALUE=DATE (all-day) and DATE-TIME events.
 * Does NOT require any external library.
 */
function parseIcs(raw: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  // Unfold continuation lines (RFC 5545 §3.1)
  const unfolded = raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let current: Partial<IcsEvent> & { dtstart: string; dtend: string } = { dtstart: '', dtend: '' };

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = { dtstart: '', dtend: '' };
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (current.dtstart) {
        const allDay = !current.dtstart.includes('T'); // DATE-only = all-day
        events.push({
          uid: current.uid ?? '',
          summary: current.summary ?? '',
          dtstart: current.dtstart,
          dtend: current.dtend,
          isAllDay: allDay,
          startDate: icsDateToISO(current.dtstart),
          endDate: icsDateToISO(current.dtend || current.dtstart),
        });
      }
      continue;
    }
    if (!inEvent) continue;

    // Property name may have parameters: "DTSTART;VALUE=DATE:20260904"
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const propFull = line.substring(0, colonIdx).toUpperCase();
    const value = line.substring(colonIdx + 1).trim();
    const propName = propFull.split(';')[0]; // strip parameters

    switch (propName) {
      case 'UID':     current.uid = value; break;
      case 'SUMMARY': current.summary = decodeIcsText(value); break;
      case 'DTSTART': current.dtstart = value; break;
      case 'DTEND':   current.dtend = value; break;
    }
  }

  return events;
}

/** Convert an ICS date value to "YYYY-MM-DD" */
function icsDateToISO(val: string): string {
  // DATE-only: "20260904"
  // DATE-TIME: "20260904T090000Z" or "20260904T090000"
  const d = val.replace(/T.*$/, ''); // strip time part
  if (d.length === 8) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  return d; // already formatted or empty
}

/** Unescape ICS text (\\n → \n, \\, → ,, etc.) */
function decodeIcsText(val: string): string {
  return val.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Shared leave-check logic given raw ICS text */
function checkLeaveInRaw(raw: string, dateStr: string, keywords: string[]): { found: boolean; allDayCount: number } {
  const events = parseIcs(raw);
  const allDayCount = events.filter((e) => e.isAllDay).length;
  const found = events.some((e) => {
    if (!e.isAllDay) return false;
    // iCal DTEND for all-day is exclusive (the day after), so: startDate <= dateStr < endDate
    if (e.startDate > dateStr) return false;
    if (e.endDate && e.endDate <= dateStr) return false;
    return keywords.some((kw) => e.summary.toLowerCase().includes(kw));
  });
  return { found, allDayCount };
}

/** Validate that a URL is reachable and returns valid ICS data */
export async function testIcsUrl(url: string): Promise<{ ok: boolean; eventCount: number; error?: string }> {
  if (!url.startsWith('http')) {
    return { ok: false, eventCount: 0, error: 'URL must start with http:// or https://' };
  }
  try {
    const res = await axios.get<string>(url, { timeout: 10_000, responseType: 'text' });
    if (!res.data.includes('BEGIN:VCALENDAR')) {
      return { ok: false, eventCount: 0, error: 'URL did not return a valid iCalendar file. Make sure you copied the ICS link, not the HTML link.' };
    }
    const events = parseIcs(res.data);
    const allDayCount = events.filter((e) => e.isAllDay).length;
    getLogger().info(`ICS URL test OK: ${events.length} events (${allDayCount} all-day)`);
    return { ok: true, eventCount: events.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    getLogger().warn(`ICS URL test failed: ${msg}`);
    return { ok: false, eventCount: 0, error: `Could not fetch calendar: ${msg}` };
  }
}

/** Validate that a local .ics file exists and contains valid ICS data */
export function testIcsFile(filePath: string): { ok: boolean; eventCount: number; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, eventCount: 0, error: 'File not found' };
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.includes('BEGIN:VCALENDAR')) {
      return { ok: false, eventCount: 0, error: 'Not a valid iCalendar file' };
    }
    const events = parseIcs(raw);
    const allDayCount = events.filter((e) => e.isAllDay).length;
    getLogger().info(`ICS file test OK: ${events.length} events (${allDayCount} all-day) — ${filePath}`);
    return { ok: true, eventCount: events.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, eventCount: 0, error: msg };
  }
}

/**
 * Check if today falls within any manually-entered leave date range.
 */
export function hasManualLeaveToday(dateStr: string): boolean {
  const { leaveDates } = getSettings();
  if (!leaveDates?.length) return false;
  const found = leaveDates.some((r) => dateStr >= r.from && dateStr <= r.to);
  if (found) getLogger().info(`Manual leave match for ${dateStr}`);
  return found;
}

/**
 * Check if today has a leave event — tries ICS URL, then local file, then manual dates.
 * Returns false gracefully if nothing is configured or all sources fail.
 */
export async function hasLeaveEventToday(dateStr: string): Promise<boolean> {
  const settings = getSettings();
  const keywords = settings.leaveKeywords.map((k) => k.toLowerCase());

  // Mode A — live URL (always fresh)
  if (settings.icsUrl) {
    try {
      const res = await axios.get<string>(settings.icsUrl, { timeout: 10_000, responseType: 'text' });
      const { found, allDayCount } = checkLeaveInRaw(res.data, dateStr, keywords);
      getLogger().info(`ICS URL check for ${dateStr}: ${allDayCount} all-day events, leave=${found}`);
      if (found) return true;
    } catch (err) {
      getLogger().error(`ICS URL calendar check failed: ${err}`);
    }
  }

  // Mode B — local .ics file
  if (settings.icsFilePath) {
    try {
      if (fs.existsSync(settings.icsFilePath)) {
        const raw = fs.readFileSync(settings.icsFilePath, 'utf-8');
        const { found, allDayCount } = checkLeaveInRaw(raw, dateStr, keywords);
        getLogger().info(`ICS file check for ${dateStr}: ${allDayCount} all-day events, leave=${found}`);
        if (found) return true;
      } else {
        getLogger().warn(`ICS file not found at path: ${settings.icsFilePath}`);
      }
    } catch (err) {
      getLogger().error(`ICS file calendar check failed: ${err}`);
    }
  }

  // Mode C — manual leave dates
  return hasManualLeaveToday(dateStr);
}

/** Save the ICS URL to settings */
export function saveIcsUrl(url: string): void {
  saveSettings({ icsUrl: url });
  getLogger().info('ICS calendar URL saved');
}

/** Save the ICS file path to settings */
export function saveIcsFilePath(filePath: string): void {
  saveSettings({ icsFilePath: filePath });
  getLogger().info(`ICS file path saved: ${filePath}`);
}
