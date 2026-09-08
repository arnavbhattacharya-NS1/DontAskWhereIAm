import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { getLogger } from '../logger';
import type { AppConfig } from '../types';

const CACHE_FILE = () => path.join(app.getPath('userData'), 'bank-holidays-cache.json');

interface HolidayEntry {
  date: string; // "YYYY-MM-DD"
  name: string;
}

interface HolidayCache {
  year: number;
  holidays: HolidayEntry[];
}

// Bundled fallback for Ireland 2025 & 2026
const FALLBACK_HOLIDAYS: Record<number, HolidayEntry[]> = {
  2025: [
    { date: '2025-01-01', name: "New Year's Day" },
    { date: '2025-02-03', name: "St. Brigid's Day" },
    { date: '2025-03-17', name: "St. Patrick's Day" },
    { date: '2025-04-18', name: 'Good Friday' },
    { date: '2025-04-21', name: 'Easter Monday' },
    { date: '2025-05-05', name: 'May Bank Holiday' },
    { date: '2025-06-02', name: 'June Bank Holiday' },
    { date: '2025-08-04', name: 'August Bank Holiday' },
    { date: '2025-10-27', name: 'October Bank Holiday' },
    { date: '2025-12-25', name: 'Christmas Day' },
    { date: '2025-12-26', name: "St. Stephen's Day" },
  ],
  2026: [
    { date: '2026-01-01', name: "New Year's Day" },
    { date: '2026-02-02', name: "St. Brigid's Day" },
    { date: '2026-03-17', name: "St. Patrick's Day" },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-04-06', name: 'Easter Monday' },
    { date: '2026-05-04', name: 'May Bank Holiday' },
    { date: '2026-06-01', name: 'June Bank Holiday' },
    { date: '2026-08-03', name: 'August Bank Holiday' },
    { date: '2026-10-26', name: 'October Bank Holiday' },
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-26', name: "St. Stephen's Day" },
  ],
};

let _cache: HolidayCache | null = null;

async function fetchHolidays(config: AppConfig, year: number): Promise<HolidayEntry[]> {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${config.bankHolidayCountryCode}`;
  try {
    const res = await axios.get<{ date: string; name: string }[]>(url, { timeout: 5000 });
    getLogger().info(`Fetched ${res.data.length} bank holidays for ${year} from Nager.Date`);
    return res.data.map((h) => ({ date: h.date, name: h.name }));
  } catch (err) {
    getLogger().warn(`Bank holiday API unreachable, using fallback. Error: ${err}`);
    return FALLBACK_HOLIDAYS[year] ?? [];
  }
}

export async function loadHolidays(config: AppConfig): Promise<void> {
  const year = new Date().getFullYear();

  // Use in-memory cache if already loaded for current year
  if (_cache && _cache.year === year) return;

  // Try disk cache
  try {
    const cacheFile = CACHE_FILE();
    if (fs.existsSync(cacheFile)) {
      const raw = fs.readFileSync(cacheFile, 'utf-8');
      const cached: HolidayCache = JSON.parse(raw);
      if (cached.year === year) {
        _cache = cached;
        getLogger().info(`Loaded bank holidays from disk cache for ${year}`);
        return;
      }
    }
  } catch {}

  // Fetch fresh
  const holidays = await fetchHolidays(config, year);
  _cache = { year, holidays };

  try {
    fs.writeFileSync(CACHE_FILE(), JSON.stringify(_cache, null, 2), 'utf-8');
  } catch (err) {
    getLogger().warn(`Could not write bank holiday cache: ${err}`);
  }
}

export function isBankHoliday(dateStr: string): boolean {
  if (!_cache) return false;
  return _cache.holidays.some((h) => h.date === dateStr);
}

export function getBankHolidayName(dateStr: string): string | null {
  if (!_cache) return null;
  return _cache.holidays.find((h) => h.date === dateStr)?.name ?? null;
}
