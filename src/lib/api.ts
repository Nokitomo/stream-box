import type { EpisodeLink, Provider, Stream } from "../types";

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}`);
  }
  return (await response.json()) as T;
}

function normalizeProvider(provider: string): Provider {
  const normalized = String(provider || "").toLowerCase();
  return normalized === "animeunity" ? "animeunity" : "streamingunity";
}

export async function fetchStreams(provider: Provider, link: string): Promise<Stream[]> {
  const url = `/api/player/streams?provider=${encodeURIComponent(
    normalizeProvider(provider)
  )}&link=${encodeURIComponent(link)}`;
  const payload = await requestJson<{ ok: boolean; streams: Stream[] }>(url);
  return Array.isArray(payload.streams) ? payload.streams : [];
}

export async function fetchEpisodesFromProvider(
  provider: Provider,
  seasonLink: string
): Promise<EpisodeLink[]> {
  const url = `/api/player/episodes?provider=${encodeURIComponent(
    normalizeProvider(provider)
  )}&seasonLink=${encodeURIComponent(seasonLink)}`;
  const payload = await requestJson<{ ok: boolean; episodes: EpisodeLink[] }>(url);
  return Array.isArray(payload.episodes) ? payload.episodes : [];
}

export function buildProxyUrl(url: string, headers?: Record<string, string>): string {
  const params = new URLSearchParams();
  params.set("url", url);
  if (headers && Object.keys(headers).length > 0) {
    params.set("headers", JSON.stringify(headers));
  }
  return `/api/player/proxy?${params.toString()}`;
}
