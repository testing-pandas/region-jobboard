// retry-fetch.js  (ESM)
const { setTimeout: delay } = await import('node:timers/promises');

export function isTransient(err) {
  const m = String((err && err.message) || err);
  return /premature close|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR|socket hang up|network/i.test(m);
}

export async function retryFetch(fetchFn, url, opts = {}, cfg = {}) {
  const {
    retries = Number(process.env.FETCH_RETRIES || 3),
    baseDelayMs = Number(process.env.FETCH_BASE_DELAY_MS || 1000),
    timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 30000),
    onRetry = () => {},
  } = cfg;

  let attempt = 0;
  // Use AbortController for per-attempt timeout
  while (true) {
    attempt += 1;
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(new Error('Fetch timeout')), timeoutMs);

    try {
      const res = await fetchFn(url, { ...opts, signal: ac.signal });
      clearTimeout(tm);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      return res;
    } catch (err) {
      clearTimeout(tm);
      const canRetry = attempt <= retries && isTransient(err);
      if (!canRetry) throw err;
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      onRetry({ attempt, backoff, err });
      await delay(backoff);
    }
  }
}
