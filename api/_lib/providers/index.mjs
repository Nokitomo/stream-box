import {
  buildAnimeunityPayload,
  getAnimeunityEpisodes,
  getAnimeunityStreams,
} from "./animeunity.mjs";
import {
  buildStreamingunityPayload,
  getStreamingunityEpisodes,
  getStreamingunityStreams,
} from "./streamingunity.mjs";
import { normalizeText } from "../common.mjs";

function normalizeProvider(provider) {
  return normalizeText(provider || "").toLowerCase();
}

export async function buildProviderPayload({ provider, link, content }) {
  const normalized = normalizeProvider(provider);
  if (normalized === "animeunity") {
    return buildAnimeunityPayload({ link, content });
  }
  if (normalized === "streamingunity") {
    return buildStreamingunityPayload({ link, content });
  }
  throw new Error(`Provider non supportato: ${provider}`);
}

export async function getProviderEpisodes({ provider, seasonLink, contentLink }) {
  const normalized = normalizeProvider(provider);
  const sourceLink = seasonLink || contentLink;
  if (!sourceLink) return [];

  if (normalized === "animeunity") {
    return getAnimeunityEpisodes({ seasonLink: sourceLink });
  }
  if (normalized === "streamingunity") {
    return getStreamingunityEpisodes({ seasonLink: sourceLink });
  }
  throw new Error(`Provider non supportato: ${provider}`);
}

export async function getProviderStreams({ provider, link }) {
  const normalized = normalizeProvider(provider);
  if (normalized === "animeunity") {
    return getAnimeunityStreams({ link });
  }
  if (normalized === "streamingunity") {
    return getStreamingunityStreams({ link });
  }
  throw new Error(`Provider non supportato: ${provider}`);
}