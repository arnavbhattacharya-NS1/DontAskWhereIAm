import axios from 'axios';
import { getSettings, saveSettings } from '../store';
import { getLogger } from '../logger';
import type { AppConfig, MondayBoard, BoardItem, MondayStatus, DayOfWeek } from '../types';
import { MANUAL_STATUSES } from '../types';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_OAUTH_TOKEN_URL = 'https://auth.monday.com/oauth2/token';

// ─── Token management ──────────────────────────────────────────────────────

/**
 * Returns a valid access token, refreshing it if it has expired or is close
 * to expiry (within 5 minutes).  Throws if no refresh token is available.
 */
async function getAccessToken(config: AppConfig): Promise<string> {
  const settings = getSettings();

  if (!settings.mondayAccessToken) {
    throw new Error('Monday.com session expired — please sign in again.');
  }

  // mondayTokenExpiry === 0 / null means the token has no expiry (Monday.com
  // long-lived tokens don't carry an exp claim) — return it as-is.
  if (!settings.mondayTokenExpiry) {
    return settings.mondayAccessToken;
  }

  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;

  // Token still valid
  if (settings.mondayTokenExpiry > now + fiveMin) {
    return settings.mondayAccessToken;
  }

  // Token close to expiry or expired — attempt refresh if we have a refresh token
  if (!settings.mondayRefreshToken) {
    // No refresh token and token is expiring: fall back to the existing token
    // and let the API call fail naturally with a proper error message.
    getLogger().warn('Monday.com access token near expiry but no refresh token available — using existing token');
    return settings.mondayAccessToken;
  }

  getLogger().info('Monday.com access token expired, refreshing…');
  const { clientId, clientSecret } = config.monday;
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: settings.mondayRefreshToken,
  });

  const res = await axios.post(MONDAY_OAUTH_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15_000,
  });

  const { access_token, refresh_token, expires_in } = res.data as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  };

  // expires_in may be absent for long-lived tokens — store 0 to mean "no expiry"
  const expiry = expires_in ? Date.now() + expires_in * 1000 : 0;
  saveSettings({
    mondayAccessToken: access_token,
    mondayRefreshToken: refresh_token ?? settings.mondayRefreshToken,
    mondayTokenExpiry: expiry,
  });
  getLogger().info('Monday.com access token refreshed successfully');
  return access_token;
}

function authHeadersStatic(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: token,
    'API-Version': '2024-01',
  };
}

async function gql<T>(query: string, variables?: Record<string, unknown>, config?: AppConfig): Promise<T> {
  const token = config ? await getAccessToken(config) : getSettings().mondayAccessToken;
  const res = await axios.post(
    MONDAY_API_URL,
    { query, variables },
    { headers: authHeadersStatic(token) }
  );
  if (res.data.errors) {
    throw new Error(res.data.errors.map((e: { message: string }) => e.message).join(', '));
  }
  return res.data.data as T;
}

// ─── OAuth flow ────────────────────────────────────────────────────────────

/**
 * Build the Monday.com OAuth authorisation URL.
 * The user visits this URL in a browser; Monday.com redirects back to
 * `redirectUri` with a `?code=…` query parameter.
 */
export function getMondayOAuthUrl(config: AppConfig): string {
  const { clientId, redirectUri } = config.monday;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  });
  return `https://auth.monday.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange a one-time authorisation code for access + refresh tokens.
 * Saves the tokens and fetches the user's display name on success.
 * Returns { ok, name, error }.
 */
export async function exchangeMondayCode(
  code: string,
  config: AppConfig
): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const { clientId, clientSecret, redirectUri } = config.monday;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await axios.post(MONDAY_OAUTH_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15_000,
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    // Monday.com long-lived tokens don't include expires_in — store 0 to mean "no expiry"
    const expiry = expires_in ? Date.now() + expires_in * 1000 : 0;

    // Fetch display name
    const meRes = await axios.post(
      MONDAY_API_URL,
      { query: '{ me { id name } }' },
      { headers: authHeadersStatic(access_token), timeout: 10_000 }
    );

    if (meRes.data.errors) {
      return { ok: false, error: meRes.data.errors.map((e: { message: string }) => e.message).join(', ') };
    }

    const name: string = meRes.data?.data?.me?.name ?? '';
    const id: string   = meRes.data?.data?.me?.id   ?? '';

    saveSettings({
      mondayAccessToken: access_token,
      mondayRefreshToken: refresh_token,
      mondayTokenExpiry: expiry,
      mondayUserId: id,
      employeeName: name,
    });

    getLogger().info(`Monday.com OAuth successful — user: ${name}`);
    return { ok: true, name };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    getLogger().warn(`Monday.com OAuth exchange failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

// ─── Board navigation ──────────────────────────────────────────────────────

/** Fetch all boards the user has access to */
export async function fetchAllBoards(config: AppConfig): Promise<MondayBoard[]> {
  const data = await gql<{ boards: MondayBoard[] }>(`
    query { boards(limit: 100) { id name } }
  `, undefined, config);
  const log = getLogger();
  log.info(`Fetched ${data.boards.length} Monday.com boards`);
  return data.boards;
}

/** Fetch all items in a board (across all groups/week tabs) */
export async function fetchBoardItems(boardId: string, config: AppConfig): Promise<BoardItem[]> {
  // Monday.com API v2: column_values does NOT have a `title` field.
  // Column titles live on the board's `columns` array; we join by column id.
  // group is omitted — groupId/groupTitle are not used by the engine.
  const data = await gql<{
    boards: {
      columns: { id: string; title: string }[];
      items_page: {
        items: {
          id: string;
          name: string;
          column_values: { id: string; text: string | null }[];
        }[];
      };
    }[];
  }>(`
    query($boardId: [ID!]!) {
      boards(ids: $boardId) {
        columns { id title }
        items_page(limit: 500) {
          items {
            id
            name
            column_values { id text }
          }
        }
      }
    }
  `, { boardId: [boardId] }, config);

  const board = data.boards[0];
  if (!board) return [];

  // Build id→title lookup from the board's column definitions
  const colTitleById: Record<string, string> = {};
  for (const col of board.columns) {
    colTitleById[col.id] = col.title;
  }

  return board.items_page.items.map((item) => {
    const colMap: Record<string, string> = {};
    const colIds: Record<string, string> = {};
    let weekStart: string | null = null;
    let weekEnd: string | null = null;

    for (const cv of item.column_values) {
      const title = colTitleById[cv.id] ?? cv.id;
      colMap[title] = cv.text ?? '';
      colIds[title] = cv.id;
      if (title === 'Week Start') weekStart = cv.text || null;
      if (title === 'Week End') weekEnd = cv.text || null;
    }

    return {
      id: item.id,
      name: item.name,
      weekStart,
      weekEnd,
      columnValues: colMap,
      columnIds: colIds,
    };
  });
}

/**
 * Resolve the correct board for a given date.
 * Checks manual overrides first, then pattern-matches by name.
 */
export async function resolveBoardForDate(
  date: Date,
  config: AppConfig
): Promise<{ boardId: string; fromOverride: boolean } | null> {
  const settings = getSettings();
  const year = date.getFullYear();
  const overrideKey = `${settings.boardNamePrefix.toLowerCase().replace(/\s+/g, '-')}-${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  if (settings.boardOverrides[overrideKey]) {
    getLogger().info(`Using board override for ${overrideKey}`);
    return { boardId: settings.boardOverrides[overrideKey], fromOverride: true };
  }

  // Build month variants to cover common board naming styles:
  //   "Sep"  — toLocaleString short (3 chars)
  //   "Sept" — Monday.com actually uses this for September
  //   "September" — long month name
  const monthShort = date.toLocaleString('en-US', { month: 'short' });   // "Sep"
  const monthLong  = date.toLocaleString('en-US', { month: 'long' });    // "September"
  // "Sept" variant: append 't' only for September (month index 8)
  const monthSept  = date.getMonth() === 8 ? 'Sept' : monthShort;

  // Normalise a board name for fuzzy comparison:
  // lowercase, collapse whitespace & underscores to a single space
  const normalise = (s: string) => s.toLowerCase().replace(/[_\s]+/g, ' ').trim();

  // Deduplicate — for non-September months monthSept === monthShort
  const monthVariants = [...new Set([monthShort, monthSept, monthLong])];
  const candidatePatterns = monthVariants.map((m) =>
    normalise(`${settings.boardNamePrefix} ${m} Attendance ${year}`)
  );

  const boards = await fetchAllBoards(config);

  const match = boards.find((b) => candidatePatterns.includes(normalise(b.name)));

  if (match) {
    getLogger().info(`Resolved board "${match.name}" (id: ${match.id})`);
    return { boardId: match.id, fromOverride: false };
  }

  // Log what we tried so the user can see what's needed
  getLogger().warn(
    `Board not found. Tried: ${candidatePatterns.map((p) => `"${p}"`).join(' or ')}`
  );
  return null;
}

/**
 * Find the row whose Week Start–End range covers the given date.
 *
 * Each employee only sees their own rows on the board, so a name match is not
 * needed — we simply find the row whose week covers today.  The optional
 * employeeName guard is kept as a secondary filter for boards where multiple
 * employees ARE visible (e.g. manager views), falling back to date-only
 * matching when the name doesn't match any row.
 */
export function resolveItemForDate(items: BoardItem[], employeeName: string, dateStr: string): BoardItem | null {
  // Primary: date range + name match
  for (const item of items) {
    if (!item.weekStart || !item.weekEnd) continue;
    if (dateStr < item.weekStart || dateStr > item.weekEnd) continue;
    if (item.name.trim().toLowerCase() === employeeName.trim().toLowerCase()) return item;
  }
  // Fallback: date range only (handles mismatched stored name / email)
  for (const item of items) {
    if (!item.weekStart || !item.weekEnd) continue;
    if (dateStr >= item.weekStart && dateStr <= item.weekEnd) return item;
  }
  return null;
}

/** Read the current status value from today's day column */
export function readDayStatus(item: BoardItem, day: DayOfWeek): MondayStatus {
  return (item.columnValues[day] ?? '') as MondayStatus;
}

/**
 * Resolve the Monday.com column ID for a day title from a BoardItem.
 * Falls back to the day title itself if not found (belt-and-suspenders).
 */
export function resolveColumnId(item: BoardItem, day: DayOfWeek): string {
  return item.columnIds[day] ?? day;
}

/** Write a new status to today's day column */
export async function writeDayStatus(
  boardId: string,
  itemId: string,
  columnId: string,
  status: MondayStatus,
  config: AppConfig
): Promise<void> {
  // Monday.com change_column_value expects the value as a JSON string (not a nested object).
  // Status columns accept: '{"label":"WFH"}' or '{}' to clear.
  const value = status === '' ? '{}' : JSON.stringify({ label: status });

  await gql(`
    mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value
      ) { id }
    }
  `, { boardId, itemId, columnId, value }, config);

  getLogger().info(`Monday.com update: item=${itemId}, col=${columnId}, status="${status}"`);
}

export function isManualStatus(status: MondayStatus): boolean {
  return (MANUAL_STATUSES as readonly string[]).includes(status);
}

/** True if we have a non-expired access token (or a refresh token to get one) */
export function isMondayConnected(): boolean {
  const { mondayAccessToken, mondayRefreshToken } = getSettings();
  return Boolean(mondayAccessToken || mondayRefreshToken);
}
