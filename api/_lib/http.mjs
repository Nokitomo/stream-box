import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { URL } from "node:url";

const RETRY_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLookup(dnsServers) {
  const servers = Array.isArray(dnsServers)
    ? dnsServers.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  if (!servers.length) return undefined;

  const resolver = new dns.Resolver();
  resolver.setServers(servers);
  const cache = new Map();

  return function lookup(hostname, options, callback) {
    let cb = callback;
    let opts = options;
    if (typeof options === "function") {
      cb = options;
      opts = {};
    }

    if (cache.has(hostname)) {
      const cached = cache.get(hostname);
      if (opts && opts.all) {
        cb(
          null,
          cached.addresses.map((address) => ({ address, family: 4 }))
        );
        return;
      }
      cb(null, cached.addresses[0], 4);
      return;
    }

    resolver.resolve4(hostname, (err, addresses) => {
      if (err) {
        cb(err);
        return;
      }
      if (!Array.isArray(addresses) || addresses.length === 0) {
        cb(new Error(`No IPv4 records for ${hostname}`));
        return;
      }
      cache.set(hostname, { addresses });
      if (opts && opts.all) {
        cb(
          null,
          addresses.map((address) => ({ address, family: 4 }))
        );
        return;
      }
      cb(null, addresses[0], 4);
    });
  };
}

export function createHttpClient({
  defaultHeaders = {},
  timeoutMs = 20000,
  retries = 2,
  retryDelayMs = 700,
  maxRedirects = 5,
  dnsServers = [],
} = {}) {
  const lookup = buildLookup(dnsServers);

  async function doRequest({
    url,
    method = "GET",
    headers = {},
    body,
    timeout = timeoutMs,
    redirectCount = 0,
    allowRedirects = true,
  }) {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;
    const mergedHeaders = {
      "accept-encoding": "identity",
      ...defaultHeaders,
      ...headers,
    };

    let requestBody = body;
    if (
      requestBody != null &&
      typeof requestBody !== "string" &&
      !Buffer.isBuffer(requestBody)
    ) {
      requestBody = JSON.stringify(requestBody);
      if (!mergedHeaders["content-type"] && !mergedHeaders["Content-Type"]) {
        mergedHeaders["content-type"] = "application/json";
      }
    }

    if (requestBody != null) {
      const hasLength =
        Object.prototype.hasOwnProperty.call(mergedHeaders, "content-length") ||
        Object.prototype.hasOwnProperty.call(mergedHeaders, "Content-Length");
      if (!hasLength) {
        mergedHeaders["content-length"] = String(
          Buffer.byteLength(requestBody, "utf8")
        );
      }
    }

    const options = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method,
      headers: mergedHeaders,
      timeout,
      lookup,
    };

    const response = await new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: Number(res.statusCode) || 0,
            headers: res.headers || {},
            body: Buffer.concat(chunks).toString("utf8"),
            url: target.href,
          });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy(new Error(`Request timeout (${timeout}ms): ${target.href}`));
      });

      if (requestBody != null) {
        req.write(requestBody);
      }
      req.end();
    });

    const shouldRedirect =
      allowRedirects &&
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      response.headers.location;

    if (shouldRedirect) {
      if (redirectCount >= maxRedirects) {
        return response;
      }
      const nextUrl = new URL(String(response.headers.location), target.href).href;
      const nextMethod =
        response.statusCode === 303 ||
        ((response.statusCode === 301 || response.statusCode === 302) &&
          method.toUpperCase() === "POST")
          ? "GET"
          : method;
      return doRequest({
        url: nextUrl,
        method: nextMethod,
        headers,
        body: nextMethod === "GET" ? undefined : requestBody,
        timeout,
        redirectCount: redirectCount + 1,
        allowRedirects,
      });
    }

    return response;
  }

  async function request(options = {}) {
    let attempts = 0;
    let lastError = null;
    while (attempts <= retries) {
      attempts += 1;
      try {
        const response = await doRequest(options);
        if (RETRY_STATUS_CODES.has(response.statusCode) && attempts <= retries) {
          await sleep(retryDelayMs * attempts);
          continue;
        }
        return response;
      } catch (err) {
        lastError = err;
        if (attempts > retries) throw err;
        await sleep(retryDelayMs * attempts);
      }
    }
    throw lastError || new Error("Unknown HTTP request failure");
  }

  async function requestJson(options = {}) {
    const response = await request(options);
    let data = null;
    try {
      data = JSON.parse(response.body);
    } catch {
      data = null;
    }
    return { ...response, data };
  }

  return {
    request,
    requestJson,
  };
}