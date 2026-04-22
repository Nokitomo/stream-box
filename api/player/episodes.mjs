import {
  badRequest,
  getClientIp,
  getQueryParam,
  internalError,
  json,
  logEvent,
  normalizeText,
} from "../_lib/common.mjs";
import { getProviderEpisodes } from "../_lib/providers/index.mjs";
import { consumeRateLimit } from "../_lib/rate-limit.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const startedAt = Date.now();
  const clientIp = getClientIp(req);
  const rate = consumeRateLimit({
    scope: "player-episodes",
    identity: clientIp,
    limit: 80,
    windowMs: 60_000,
  });
  res.setHeader("X-RateLimit-Limit", String(rate.limit));
  res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  res.setHeader("X-RateLimit-Reset", String(rate.resetAt));
  if (!rate.allowed) {
    return json(
      res,
      429,
      { ok: false, error: "Too many requests" },
      { cacheControl: "no-store" }
    );
  }

  const provider = getQueryParam(req, "provider");
  if (!provider) return badRequest(res, "Parametro provider mancante");

  const seasonLink = getQueryParam(req, "seasonLink");
  const contentLink = getQueryParam(req, "contentLink");

  try {
    const episodes = await getProviderEpisodes({ provider, seasonLink, contentLink });
    logEvent("player_episodes_ok", {
      provider: normalizeText(provider).toLowerCase(),
      episodeCount: Array.isArray(episodes) ? episodes.length : 0,
      elapsedMs: Date.now() - startedAt,
      ip: clientIp,
    });
    return json(res, 200, {
      ok: true,
      provider: normalizeText(provider).toLowerCase(),
      episodes,
    }, { cacheControl: "public, max-age=60, s-maxage=120, stale-while-revalidate=300" });
  } catch (error) {
    logEvent("player_episodes_error", {
      provider: normalizeText(provider).toLowerCase(),
      elapsedMs: Date.now() - startedAt,
      ip: clientIp,
      message: normalizeText(error?.message || error),
    });
    return internalError(res, error);
  }
}
