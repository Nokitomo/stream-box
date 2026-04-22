import type {
  AppSettings,
  HistoryItem,
  ProgressItem,
  WatchlistItem,
} from "../types";

const NAMESPACE = "vega_web_v1";

const DEFAULT_SETTINGS: AppSettings = {
  preferProxyPlayback: false,
  preferDirectPlayback: true,
  subtitlesEnabled: true,
  autoSyncOnLogin: true,
};

const SETTINGS_UPDATED_AT_KEY = "settingsUpdatedAt";

function key(name: string): string {
  return `${NAMESPACE}:${name}`;
}

function readJson<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(name: string, value: T): void {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    // ignore quota errors in legacy browsers
  }
}

export function getSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...readJson<AppSettings>("settings", DEFAULT_SETTINGS),
  };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  writeJson("settings", next);
  writeJson(SETTINGS_UPDATED_AT_KEY, new Date().toISOString());
  return next;
}

export function getWatchlist(): WatchlistItem[] {
  return readJson<WatchlistItem[]>("watchlist", []);
}

export function replaceWatchlist(items: WatchlistItem[]): void {
  writeJson("watchlist", Array.isArray(items) ? items : []);
}

export function upsertWatchlist(item: WatchlistItem): void {
  const list = getWatchlist();
  const next = [item, ...list.filter((entry) => entry.id !== item.id)].slice(0, 2000);
  writeJson("watchlist", next);
}

export function removeWatchlist(id: string): void {
  writeJson(
    "watchlist",
    getWatchlist().filter((item) => item.id !== id)
  );
}

export function getHistory(): HistoryItem[] {
  return readJson<HistoryItem[]>("history", []);
}

export function replaceHistory(items: HistoryItem[]): void {
  writeJson("history", Array.isArray(items) ? items : []);
}

export function pushHistory(item: HistoryItem): void {
  const list = getHistory();
  const next = [item, ...list.filter((entry) => entry.id !== item.id)].slice(0, 4000);
  writeJson("history", next);
}

export function getProgressMap(): Record<string, ProgressItem> {
  return readJson<Record<string, ProgressItem>>("progress", {});
}

export function replaceProgressMap(map: Record<string, ProgressItem>): void {
  writeJson("progress", map && typeof map === "object" ? map : {});
}

export function upsertProgress(item: ProgressItem): void {
  const map = getProgressMap();
  map[item.id] = item;
  writeJson("progress", map);
}

export function getProgressById(id: string): ProgressItem | undefined {
  return getProgressMap()[id];
}

export function replaceSettings(settings: AppSettings): void {
  writeJson("settings", { ...DEFAULT_SETTINGS, ...(settings || {}) });
  writeJson(SETTINGS_UPDATED_AT_KEY, new Date().toISOString());
}

export function getSettingsUpdatedAt(): string {
  return readJson<string>(SETTINGS_UPDATED_AT_KEY, "");
}

export function getSyncSnapshot() {
  return {
    settings: getSettings(),
    watchlist: getWatchlist(),
    history: getHistory(),
    progress: Object.values(getProgressMap()),
  };
}
