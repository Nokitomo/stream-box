import {
  badRequest,
  getQueryParam,
  internalError,
  json,
  normalizeText,
} from "../_lib/common.mjs";
import { buildProviderPayload } from "../_lib/providers/index.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const provider = getQueryParam(req, "provider");
  if (!provider) return badRequest(res, "Parametro provider mancante");

  const link = getQueryParam(req, "link");
  const content = {
    id: getQueryParam(req, "contentId"),
    title: getQueryParam(req, "title"),
    poster: getQueryParam(req, "poster"),
    backdrop: getQueryParam(req, "backdrop"),
    infoUrl: getQueryParam(req, "infoUrl"),
  };

  try {
    const payload = await buildProviderPayload({ provider, link, content });
    return json(res, 200, {
      ok: true,
      provider: normalizeText(provider).toLowerCase(),
      payload,
    });
  } catch (error) {
    return internalError(res, error);
  }
}