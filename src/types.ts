export type Provider = "animeunity" | "streamingunity";

export type Stream = {
  server: string;
  link: string;
  type: string;
  quality?: string;
  subtitles?: Array<{
    title: string;
    language: string;
    type: string;
    uri: string;
  }>;
  headers?: Record<string, string>;
};

export type EpisodeLink = {
  title: string;
  titleKey?: string;
  titleParams?: Record<string, string | number>;
  episodeNumber?: number;
  seasonNumber?: number;
  link: string;
};

export type PlaybackLink = {
  title: string;
  titleKey?: string;
  titleParams?: Record<string, string | number>;
  quality?: string;
  seasonNumber?: number;
  availabilityStatus?: "upcoming" | "available";
  availabilityDate?: string;
  availabilityPrecision?: "day" | "year" | "unknown";
  episodesLink?: string;
  seasonKey?: string;
  directLinks?: Array<{
    title: string;
    titleKey?: string;
    titleParams?: Record<string, string | number>;
    episodeNumber?: number;
    seasonNumber?: number;
    link: string;
    type?: "movie" | "series";
  }>;
};

export type CatalogSummaryItem = {
  id: string;
  provider: Provider;
  title: string;
  kicker: string;
  type: "movie" | "series";
  year: number;
  maturity: string;
  duration: string;
  genres: string[];
  cast: string;
  description: string;
  match: number;
  isNew: boolean;
  rank: number;
  progress: number;
  rows: string[];
  poster: string;
  backdrop: string;
  score: number;
  views: number;
  dailyViews: number;
  categoryTags: string[];
  sourceLink: string;
  detailChunk: string;
};

export type CatalogDetailItem = {
  id: string;
  provider: Provider;
  title: string;
  synopsis: string;
  type: "movie" | "series";
  status?: string;
  season?: string;
  year: number;
  score?: number;
  maturity: string;
  duration: string;
  episodesCount?: number;
  seasonsCount?: number;
  runtime?: number;
  releaseDate?: string;
  lastAirDate?: string;
  quality?: string;
  studio?: string;
  dubbed?: boolean;
  dubIta?: boolean;
  subIta?: boolean;
  genres: string[];
  tags: string[];
  keywords: string[];
  cast: string[];
  directors: string[];
  ids: Record<string, string | number | undefined>;
  stats: Record<string, string | number | undefined>;
  images: {
    image?: string;
    poster?: string;
    cover?: string;
    background?: string;
    logo?: string;
  };
  links: {
    page?: string;
    watch?: string;
    source?: string;
  };
  related: Array<{
    id?: string | number;
    slug?: string;
    title: string;
    type?: string;
    year?: string;
    image?: string;
    link?: string;
  }>;
  seasons: Array<{
    id?: string | number;
    number?: number;
    name?: string;
    episodesCount?: number;
    releaseDate?: string;
  }>;
  playback?: {
    linkList: PlaybackLink[];
    defaultSeasonKey?: string;
  };
};

export type SearchIndexEntry = {
  id: string;
  provider: Provider;
  title: string;
  type: "movie" | "series";
  year: number;
  aliases: string[];
  tokens: string[];
};

export type EpisodesSeasonItem = {
  contentId: string;
  provider: Provider;
  seasonKey: string;
  seasonNumber?: number;
  seasonTitle: string;
  episodesLink?: string;
  episodes: EpisodeLink[];
};

export type CatalogIndex = {
  schemaVersion: number;
  generatedAt: string;
  totalItems: number;
  featuredId: string;
  maxItemsPerRow: number;
  rowConfigs: Array<{ id: string; title: string; top10?: boolean }>;
  detailChunks: Array<{ file: string; count: number; chunk: number }>;
  items: CatalogSummaryItem[];
};

export type AppManifest = {
  schemaVersion: number;
  version: string;
  generatedAt: string;
  datasets: {
    catalogIndex: string;
    searchIndex: string;
    episodesIndex: string;
  };
  counts: {
    totalItems: number;
    detailChunks: number;
    searchEntries: number;
    episodeSeasons: number;
  };
};

export type AppSettings = {
  preferProxyPlayback: boolean;
  preferDirectPlayback: boolean;
  subtitlesEnabled: boolean;
  autoSyncOnLogin: boolean;
};

export type ProgressItem = {
  id: string;
  provider: Provider;
  title: string;
  poster: string;
  sourceLink: string;
  seasonKey?: string;
  episodeLink?: string;
  episodeTitle?: string;
  position: number;
  duration: number;
  updatedAt: string;
};

export type HistoryItem = {
  id: string;
  provider: Provider;
  title: string;
  poster: string;
  sourceLink: string;
  watchedAt: string;
  seasonKey?: string;
  episodeLink?: string;
  episodeTitle?: string;
};

export type WatchlistItem = {
  id: string;
  provider: Provider;
  title: string;
  poster: string;
  sourceLink: string;
  addedAt: string;
};
