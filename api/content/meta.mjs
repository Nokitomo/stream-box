import {
  badRequest,
  getClientIp,
  getQueryParam,
  json,
  logEvent,
  normalizeText,
} from "../_lib/common.mjs";
import { consumeRateLimit } from "../_lib/rate-limit.mjs";
import { loadCatalogIndex, loadDetailById } from "../_lib/data-catalog.mjs";

function requestOrigin(req) {
  const proto =
    String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() || "https";
  const host =
    String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "")
      .split(",")[0]
      .trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const startedAt = Date.now();
  const clientIp = getClientIp(req);
  const rate = consumeRateLimit({
    scope: "content-meta",
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
  if (!contentId) return badRequest(res, "Parametro contentId mancante");

  try {
    const origin = requestOrigin(req);
    if (!origin) {
      return json(res, 500, { ok: false, error: "Origin non disponibile" }, { cacheControl: "no-store" });
    }

    const [detail, index] = await Promise.all([
      loadDetailById(contentId, origin),
      loadCatalogIndex(origin),
    ]);
    if (!detail) {
      return json(res, 404, { ok: false, error: "Contenuto non trovato" }, { cacheControl: "no-store" });
    }

    const summary = Array.isArray(index?.items)
      ? index.items.find((item) => item.id === contentId) || null
      : null;

    logEvent("content_meta_ok", {
      id: normalizeText(contentId),
      elapsedMs: Date.now() - startedAt,
      ip: clientIp,
    });

    return json(
      res,
      200,
      {
        ok: true,
        detail,
        summary,
      },
      { cacheControl: "public, max-age=120, s-maxage=300, stale-while-revalidate=600" }
    );
  } catch (error) {
    logEvent("content_meta_error", {
      id: normalizeText(contentId),
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
