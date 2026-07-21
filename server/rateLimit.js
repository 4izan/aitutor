export function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> timestamps within the trailing window

  function check(key, now) {
    const cutoff = now - windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  }

  return { check };
}

export function rateLimitMiddleware(limiter, onLimited) {
  return (req, res, next) => {
    if (!limiter.check(req.ip, Date.now())) {
      onLimited(res);
      return;
    }
    next();
  };
}
