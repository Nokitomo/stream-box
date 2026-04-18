import {
  badRequest,
  getQueryParam,
  internalError,
  json,
  normalizeText,
} from "../_lib/common.mjs";
import { getProviderStreams } from "../_lib/providers/index.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const provider = getQueryParam(req, "provider");
  if (!provider) return badRequest(res, "Parametro provider mancante");

  const link = getQueryParam(req, "link");
  if (!link) return badRequest(res, "Parametro link mancante");

  try {
    const streams = await getProviderStreams({ provider, link });
    return json(res, 200, {
      ok: true,
      provider: normalizeText(provider).toLowerCase(),
      streams,
    });
  } catch (error) {
    return internalError(res, error);
  }
}