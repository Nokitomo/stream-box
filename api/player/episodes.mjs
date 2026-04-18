import {
  badRequest,
  getQueryParam,
  internalError,
  json,
  normalizeText,
} from "../_lib/common.mjs";
import { getProviderEpisodes } from "../_lib/providers/index.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const provider = getQueryParam(req, "provider");
  if (!provider) return badRequest(res, "Parametro provider mancante");

  const seasonLink = getQueryParam(req, "seasonLink");
  const contentLink = getQueryParam(req, "contentLink");

  try {
    const episodes = await getProviderEpisodes({ provider, seasonLink, contentLink });
    return json(res, 200, {
      ok: true,
      provider: normalizeText(provider).toLowerCase(),
      episodes,
    });
  } catch (error) {
    return internalError(res, error);
  }
}