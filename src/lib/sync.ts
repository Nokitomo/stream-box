import type {
  AppSettings,
  HistoryItem,
  ProgressItem,
  WatchlistItem,
} from "../types";
import { getSupabaseClient } from "./supabase";
import {
  getSettingsUpdatedAt,
  getSyncSnapshot,
  replaceHistory,
  replaceProgressMap,
  replaceSettings,
  replaceWatchlist,
} from "./storage";

type SyncState = {
  enabled: boolean;
  lastSyncAt?: string;
  lastError?: string;
};

type WatchlistRow = {
  user_id: string;
  content_id: string;
  provider: string;
  title: string;
  poster: string;
  source_link: string;
  added_at: string;
  updated_at: string;
};

type HistoryRow = {
  user_id: string;
  content_id: string;
  provider: string;
  title: string;
  poster: string;
  source_link: string;
  watched_at: string;
  season_key: string | null;
  episode_link: string | null;
  episode_title: string | null;
  updated_at: string;
};

type ProgressRow = {
  user_id: string;
  content_id: string;
  provider: string;
  title: string;
  poster: string;
  source_link: string;
  season_key: string | null;
  episode_link: string | null;
  episode_title: string | null;
  position: number;
  duration: number;
  updated_at: string;
};

type SettingsRow = {
  user_id: string;
  settings: AppSettings;
  updated_at: string;
};

const state: SyncState = {
  enabled: false,
};

function toTime(value: string | undefined | null): number {
  if (!value) return 0;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function localToWatchlistRow(userId: string, item: WatchlistItem): WatchlistRow {
  const updated = item.addedAt || new Date().toISOString();
  return {
    user_id: userId,
    content_id: item.id,
    provider: item.provider,
    title: item.title,
    poster: item.poster,
    source_link: item.sourceLink,
    added_at: item.addedAt || updated,
    updated_at: updated,
  };
}

function rowToWatchlistItem(row: WatchlistRow): WatchlistItem {
  return {
    id: row.content_id,
    provider: row.provider as WatchlistItem["provider"],
    title: row.title,
    poster: row.poster,
    sourceLink: row.source_link,
    addedAt: row.added_at || row.updated_at,
  };
}

function localToHistoryRow(userId: string, item: HistoryItem): HistoryRow {
  const updated = item.watchedAt || new Date().toISOString();
  return {
    user_id: userId,
    content_id: item.id,
    provider: item.provider,
    title: item.title,
    poster: item.poster,
    source_link: item.sourceLink,
    watched_at: item.watchedAt || updated,
    season_key: item.seasonKey || null,
    episode_link: item.episodeLink || null,
    episode_title: item.episodeTitle || null,
    updated_at: updated,
  };
}

function rowToHistoryItem(row: HistoryRow): HistoryItem {
  return {
    id: row.content_id,
    provider: row.provider as HistoryItem["provider"],
    title: row.title,
    poster: row.poster,
    sourceLink: row.source_link,
    watchedAt: row.watched_at || row.updated_at,
    seasonKey: row.season_key || undefined,
    episodeLink: row.episode_link || undefined,
    episodeTitle: row.episode_title || undefined,
  };
}

function localToProgressRow(userId: string, item: ProgressItem): ProgressRow {
  return {
    user_id: userId,
    content_id: item.id,
    provider: item.provider,
    title: item.title,
    poster: item.poster,
    source_link: item.sourceLink,
    season_key: item.seasonKey || null,
    episode_link: item.episodeLink || null,
    episode_title: item.episodeTitle || null,
    position: item.position,
    duration: item.duration,
    updated_at: item.updatedAt || new Date().toISOString(),
  };
}

function rowToProgressItem(row: ProgressRow): ProgressItem {
  return {
    id: row.content_id,
    provider: row.provider as ProgressItem["provider"],
    title: row.title,
    poster: row.poster,
    sourceLink: row.source_link,
    seasonKey: row.season_key || undefined,
    episodeLink: row.episode_link || undefined,
    episodeTitle: row.episode_title || undefined,
    position: Number(row.position || 0),
    duration: Number(row.duration || 0),
    updatedAt: row.updated_at,
  };
}

function mergeByTimestamp<T extends { id: string }, R extends { content_id: string }>(
  localItems: T[],
  remoteRows: R[],
  localToRow: (item: T) => { updated_at: string; [key: string]: unknown },
  remoteToLocal: (row: R) => T,
  remoteUpdatedAt: (row: R) => string
): T[] {
  const map = new Map<string, { item: T; ts: number }>();

  for (const item of localItems) {
    const row = localToRow(item);
    map.set(item.id, { item, ts: toTime(String(row.updated_at || "")) });
  }

  for (const row of remoteRows) {
    const id = String(row.content_id || "");
    if (!id) continue;
    const remoteTs = toTime(remoteUpdatedAt(row));
    const existing = map.get(id);
    if (!existing || remoteTs > existing.ts) {
      map.set(id, { item: remoteToLocal(row), ts: remoteTs });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.ts - a.ts)
    .map((entry) => entry.item);
}

async function loadRemoteRows(userId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      watchlist: [] as WatchlistRow[],
      history: [] as HistoryRow[],
      progress: [] as ProgressRow[],
      settings: null as SettingsRow | null,
    };
  }

  const [watchlistRes, historyRes, progressRes, settingsRes] = await Promise.all([
    supabase.from("user_watchlist").select("*").eq("user_id", userId).limit(5000),
    supabase.from("user_history").select("*").eq("user_id", userId).limit(5000),
    supabase.from("user_progress").select("*").eq("user_id", userId).limit(5000),
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  if (watchlistRes.error) throw watchlistRes.error;
  if (historyRes.error) throw historyRes.error;
  if (progressRes.error) throw progressRes.error;
  if (settingsRes.error) throw settingsRes.error;

  return {
    watchlist: (watchlistRes.data || []) as WatchlistRow[],
    history: (historyRes.data || []) as HistoryRow[],
    progress: (progressRes.data || []) as ProgressRow[],
    settings: (settingsRes.data || null) as SettingsRow | null,
  };
}

function mergeSettings(localSettings: AppSettings, remoteSettings: SettingsRow | null): AppSettings {
  if (!remoteSettings || !remoteSettings.settings) return localSettings;
  const localTs = toTime(getSettingsUpdatedAt());
  const remoteTs = toTime(remoteSettings.updated_at);
  if (remoteTs > localTs) return remoteSettings.settings;
  return localSettings;
}

async function writeMergedCloudState(
  userId: string,
  watchlist: WatchlistItem[],
  history: HistoryItem[],
  progress: ProgressItem[],
  settings: AppSettings
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const now = new Date().toISOString();

  const watchlistRows = watchlist.map((item) => localToWatchlistRow(userId, item));
  const historyRows = history.map((item) => localToHistoryRow(userId, item));
  const progressRows = progress.map((item) => localToProgressRow(userId, item));
  const settingsRow = {
    user_id: userId,
    settings,
    updated_at: now,
  };

  if (watchlistRows.length > 0) {
    const { error } = await supabase
      .from("user_watchlist")
      .upsert(watchlistRows, { onConflict: "user_id,content_id" });
    if (error) throw error;
  }

  if (historyRows.length > 0) {
    const { error } = await supabase
      .from("user_history")
      .upsert(historyRows, { onConflict: "user_id,content_id" });
    if (error) throw error;
  }

  if (progressRows.length > 0) {
    const { error } = await supabase
      .from("user_progress")
      .upsert(progressRows, { onConflict: "user_id,content_id" });
    if (error) throw error;
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert(settingsRow, { onConflict: "user_id" });
  if (error) throw error;
}

export function getSyncState(): SyncState {
  return { ...state };
}

export async function syncLocalDataToCloud(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const snapshot = getSyncSnapshot();
  const remote = await loadRemoteRows(userId);

  const mergedWatchlist = mergeByTimestamp(
    snapshot.watchlist,
    remote.watchlist,
    (item) => localToWatchlistRow(userId, item),
    rowToWatchlistItem,
    (row) => row.updated_at
  );
  const mergedHistory = mergeByTimestamp(
    snapshot.history,
    remote.history,
    (item) => localToHistoryRow(userId, item),
    rowToHistoryItem,
    (row) => row.updated_at
  );
  const mergedProgress = mergeByTimestamp(
    snapshot.progress,
    remote.progress,
    (item) => localToProgressRow(userId, item),
    rowToProgressItem,
    (row) => row.updated_at
  );
  const mergedSettings = mergeSettings(snapshot.settings, remote.settings);

  replaceWatchlist(mergedWatchlist);
  replaceHistory(mergedHistory);
  replaceProgressMap(Object.fromEntries(mergedProgress.map((item) => [item.id, item])));
  replaceSettings(mergedSettings);

  await writeMergedCloudState(
    userId,
    mergedWatchlist,
    mergedHistory,
    mergedProgress,
    mergedSettings
  );
}

export function setSyncEnabled(enabled: boolean): void {
  state.enabled = enabled;
}

export async function runInitialSync(userId: string): Promise<void> {
  state.lastError = undefined;
  try {
    await syncLocalDataToCloud(userId);
    state.lastSyncAt = new Date().toISOString();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
