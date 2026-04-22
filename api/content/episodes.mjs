import {
  badRequest,
  getClientIp,
  getQueryParam,
  json,
  logEvent,
  normalizeText,
} from "../_lib/common.mjs";
import { consumeRateLimit } from "../_lib/rate-limit.mjs";
import { loadEpisodesBySeason } from "../_lib/data-catalog.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const startedAt = Date.now();
  const clientIp = getClientIp(req);
  const rate = consumeRateLimit({
    scope: "content-episodes",
    identity: clientIp,
    limit: 120,
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

  const contentId = getQueryParam(req, "contentId");
  const seasonKey = getQueryParam(req, "seasonKey");
  if (!contentId) return badRequest(res, "Parametro contentId mancante");
  if (!seasonKey) return badRequest(res, "Parametro seasonKey mancante");

  try {
    const season = await loadEpisodesBySeason(contentId, seasonKey);
    if (!season) {
      return json(
        res,
        404,
        { ok: false, error: "Episodi non trovati" },
        { cacheControl: "no-store" }
      );
    }

    logEvent("content_episodes_ok", {
      id: normalizeText(contentId),
      seasonKey: normalizeText(seasonKey),
      episodeCount: Array.isArray(season.episodes) ? season.episodes.length : 0,
      elapsedMs: Date.now() - startedAt,
      ip: clientIp,
    });

    return json(
      res,
      200,
      {
        ok: true,
        season,
      },
      { cacheControl: "public, max-age=120, s-maxage=300, stale-while-revalidate=600" }
    );
  } catch (error) {
    logEvent("content_episodes_error", {
      id: normalizeText(contentId),
      seasonKey: normalizeText(seasonKey),
      elapsedMs: Date.now() - startedAt,
      ip: clientIp,
      message: normalizeText(error?.message || error),
    });
    return json(
      res,
      500,
      {
        ok: false,
        error: normalizeText(error?.message || error) || "Internal error",
      },
      { cacheControl: "no-store" }
    );
  }
}
