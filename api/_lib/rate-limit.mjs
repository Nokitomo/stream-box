import { normalizeText } from "./common.mjs";

const buckets = new Map();

function nowMs() {
  return Date.now();
}

export function consumeRateLimit({
  scope,
  identity,
  limit = 30,
  windowMs = 60_000,
}) {
  const normalizedScope = normalizeText(scope || "global");
  const normalizedIdentity = normalizeText(identity || "anon");
  const key = `${normalizedScope}:${normalizedIdentity}`;
  const now = nowMs();

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + windowMs,
      limit,
    };
    buckets.set(key, next);
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: next.resetAt,
      limit,
    };
  }

  current.count += 1;
  current.limit = limit;
  if (current.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
      limit,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    limit,
  };
}
