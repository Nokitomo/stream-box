import {
  badRequest,
  getClientIp,
  getQueryParam,
  internalError,
  json,
  logEvent,
  normalizeText,
} from "../_lib/common.mjs";
import { getProviderStreams } from "../_lib/providers/index.mjs";
import { consumeRateLimit } from "../_lib/rate-limit.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const startedAt = Date.now();
  const clientIp = getClientIp(req);
  const rate = consumeRateLimit({
    scope: "player-streams",
    identity: clientIp,
    limit: 45,
    windowMs: 60_000,
  });
  res.setHeader("X-RateLimit-Limit", String(rate.limit));
  res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
  res.setHeader("X-RateLimit-Reset", String(rate.resetAt));
  if (!rate.allowed) {
    logEvent("player_streams_rate_limited", {
      ip: clientIp,
      path: req.url || "",
    });
    return json(
      res,
      429,
      { ok: false, error: "Too many requests" },
      { cacheControl: "no-store" }
    );
  }

  const provider = getQueryParam(req, "provider");
  if (!provider) return badRequest(res, "Parametro provider mancante");

  const link = getQueryParam(req, "link");
  if (!link) return badRequest(res, "Parametro link mancante");

  try {
    const streams = await getProviderStreams({ provider, link });
    const elapsedMs = Date.now() - startedAt;
    logEvent("player_streams_ok", {
      provider: normalizeText(provider).toLowerCase(),
      streamCount: Array.isArray(streams) ? streams.length : 0,
      elapsedMs,
      ip: clientIp,
    });
    return json(res, 200, {
      ok: true,
      provider: normalizeText(provider).toLowerCase(),
      streams,
    }, { cacheControl: "public, max-age=15, s-maxage=30, stale-while-revalidate=60" });
  } catch (error) {
    logEvent("player_streams_error", {
      provider: normalizeText(provider).toLowerCase(),
      elapsedMs: Date.now() - startedAt,
      ip: clientIp,
      message: normalizeText(error?.message || error),
    });
    return internalError(res, error);
  }
}
