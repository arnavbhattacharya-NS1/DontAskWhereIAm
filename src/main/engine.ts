import { isConnectedToIBMWifi } from './services/wifiService';
import { isBankHoliday } from './services/holidayService';
import { hasLeaveEventToday } from './services/calendarService';
import {
  resolveBoardForDate,
  fetchBoardItems,
  resolveItemForDate,
  readDayStatus,
  resolveColumnId,
  writeDayStatus,
  isManualStatus,
} from './services/mondayService';
import { getLogger } from './logger';
import { getSettings } from './store';
import type { AppConfig, DailyState, DayOfWeek, MondayStatus } from './types';

const DAY_NAMES: Record<number, DayOfWeek> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
};

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export type EngineEvent =
  | { type: 'status-updated'; status: MondayStatus }
  | { type: 'no-change'; reason: string }
  | { type: 'board-not-found'; expectedName: string; boards: { id: string; name: string }[] }
  | { type: 'row-not-found'; boardId: string; boardName: string; items: { id: string; name: string }[] }
  | { type: 'week-not-found'; boardId: string }
  | { type: 'error'; message: string }
  | { type: 'weekend' }
  | { type: 'needs-auth' };

export class StatusEngine {
  private state: DailyState;
  private config: AppConfig;
  private onEvent: (event: EngineEvent) => void;

  constructor(config: AppConfig, onEvent: (event: EngineEvent) => void) {
    this.config = config;
    this.onEvent = onEvent;
    this.state = {
      date: toDateStr(new Date()),
      ibmWifiDetectedToday: false,
      statusLockedToday: false,
      currentStatus: null,
    };
  }

  /** Call at midnight or when a new day is detected */
  resetForNewDay(): void {
    const today = toDateStr(new Date());
    if (this.state.date !== today) {
      getLogger().info(`New day detected (${today}), resetting daily state`);
      this.state = {
        date: today,
        ibmWifiDetectedToday: false,
        statusLockedToday: false,
        currentStatus: null,
      };
    }
  }

  /**
   * Main entry point — run on startup and every polling cycle.
   * @param force If true, bypasses the daily Office lock. Used for manual re-runs
   *              so the user can verify the current state without waiting for a new day.
   *              The lock is never cleared — Office cannot be downgraded by a re-run.
   */
  async runCheck(force = false): Promise<void> {
    this.resetForNewDay();

    const nowMs = Date.now();
    const now = new Date(nowMs);
    const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

    // Step 1 — Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      getLogger().info('Weekend — skipping status check');
      this.onEvent({ type: 'weekend' });
      return;
    }

    const today = toDateStr(now);
    const dayName = DAY_NAMES[dayOfWeek];
    const settings = getSettings();

    // mondayTokenExpiry === 0 / null means the token has no expiry (Monday.com
    // long-lived tokens) — treat it as permanently valid.
    const hasToken = Boolean(settings.mondayAccessToken);
    const noExpiry = !settings.mondayTokenExpiry;
    const notExpired = settings.mondayTokenExpiry > nowMs;
    if (!hasToken || (!noExpiry && !notExpired && !settings.mondayRefreshToken)) {
      this.onEvent({ type: 'needs-auth' });
      return;
    }
    if (!settings.boardNamePrefix) {
      this.onEvent({ type: 'no-change', reason: 'Setup not complete' });
      return;
    }

    // Step 3 — If Office was already written today, skip Wi-Fi polling on automatic
    // cycles. Manual re-runs (force=true) bypass this so the user can verify state,
    // but Office can never be downgraded — the lock remains in place.
    if (this.state.statusLockedToday && !force) {
      getLogger().info('Office locked for today — skipping status check');
      this.onEvent({ type: 'no-change', reason: 'Office already locked' });
      return;
    }

    // Step 4 — Check IBM Wi-Fi
    const ibmConnected = await isConnectedToIBMWifi(this.config);

    if (ibmConnected) {
      this.state.ibmWifiDetectedToday = true;

      // Always write Office when IBM Wi-Fi detected, unless already Office
      try {
        const result = await this.resolveTarget(today, dayName);
        if (!result) return;

        if (result.currentStatus === 'Office') {
          getLogger().info('IBM Wi-Fi connected, status already Office — no change needed');
          this.onEvent({ type: 'no-change', reason: 'Already Office' });
          this.state.statusLockedToday = true;
          return;
        }

        await writeDayStatus(result.boardId, result.itemId, result.columnId, 'Office', this.config);
        this.state.statusLockedToday = true;
        this.state.currentStatus = 'Office';
        this.onEvent({ type: 'status-updated', status: 'Office' });
      } catch (err) {
        this.onEvent({ type: 'error', message: String(err) });
      }
      return;
    }

    // Steps 5-8 — Resolve the current cell value first
    let result: Awaited<ReturnType<typeof this.resolveTarget>>;
    try {
      result = await this.resolveTarget(today, dayName);
      if (!result) return;
    } catch (err) {
      this.onEvent({ type: 'error', message: String(err) });
      return;
    }

    const { boardId, itemId, columnId, currentStatus } = result;

    // Step 5 — Manual status: leave alone
    if (isManualStatus(currentStatus)) {
      getLogger().info(`Manual status "${currentStatus}" detected — leaving untouched`);
      this.onEvent({ type: 'no-change', reason: `Manual status: ${currentStatus}` });
      return;
    }

    // Step 6 — Bank holiday
    if (isBankHoliday(today)) {
      if (currentStatus === 'Bank holiday') {
        this.onEvent({ type: 'no-change', reason: 'Already Bank holiday' });
        return;
      }
      await writeDayStatus(boardId, itemId, columnId, 'Bank holiday', this.config);
      this.state.currentStatus = 'Bank holiday';
      this.onEvent({ type: 'status-updated', status: 'Bank holiday' });
      return;
    }

    // Step 7 — Vacation (Outlook calendar leave event)
    const onLeave = await hasLeaveEventToday(today);
    if (onLeave) {
      if (currentStatus === 'Vacation') {
        this.onEvent({ type: 'no-change', reason: 'Already Vacation' });
        return;
      }
      await writeDayStatus(boardId, itemId, columnId, 'Vacation', this.config);
      this.state.currentStatus = 'Vacation';
      this.onEvent({ type: 'status-updated', status: 'Vacation' });
      return;
    }

    // Step 8 — Default WFH
    if (currentStatus === 'WFH') {
      this.onEvent({ type: 'no-change', reason: 'Already WFH' });
      return;
    }
    await writeDayStatus(boardId, itemId, columnId, 'WFH', this.config);
    this.state.currentStatus = 'WFH';
    this.onEvent({ type: 'status-updated', status: 'WFH' });
  }

  private async resolveTarget(
    today: string,
    dayName: DayOfWeek
  ): Promise<{ boardId: string; itemId: string; columnId: string; currentStatus: MondayStatus } | null> {
    const settings = getSettings();

    // Resolve board
    const boardResult = await resolveBoardForDate(new Date(today), this.config);
    if (!boardResult) {
      const { fetchAllBoards } = await import('./services/mondayService');
      const boards = await fetchAllBoards(this.config);
      const prefix = settings.boardNamePrefix;
      const d = new Date(today);
      const monthShort = d.toLocaleString('en-US', { month: 'short' });
      const monthSept  = d.getMonth() === 8 ? 'Sept' : monthShort;
      const monthLong  = d.toLocaleString('en-US', { month: 'long' });
      const year = d.getFullYear();
      const variants = [...new Set([monthShort, monthSept, monthLong])];
      this.onEvent({
        type: 'board-not-found',
        expectedName: `${prefix} ${variants.join('/')} Attendance ${year}`,
        boards,
      });
      return null;
    }

    const items = await fetchBoardItems(boardResult.boardId, this.config);
    const item = resolveItemForDate(items, settings.employeeName, today);

    if (!item) {
      // Check if the board has items at all but the employee isn't found
      const rowItems = items.filter((i) => {
        if (!i.weekStart || !i.weekEnd) return false;
        return today >= i.weekStart && today <= i.weekEnd;
      });

      if (rowItems.length === 0) {
        // Week tab not covered — board is incomplete
        this.onEvent({ type: 'week-not-found', boardId: boardResult.boardId });
        return null;
      }

      // Week exists but employee row not found
      this.onEvent({
        type: 'row-not-found',
        boardId: boardResult.boardId,
        boardName: `${settings.boardNamePrefix} board`,
        items: rowItems.map((i) => ({ id: i.id, name: i.name })),
      });
      return null;
    }

    const currentStatus = readDayStatus(item, dayName);
    const columnId = resolveColumnId(item, dayName);
    return { boardId: boardResult.boardId, itemId: item.id, columnId, currentStatus };
  }

  getState(): DailyState {
    return { ...this.state };
  }
}
