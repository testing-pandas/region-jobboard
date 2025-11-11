// ESM version
const delay = ms => new Promise(r => setTimeout(r, ms));

export function isTransient(err) {
  const m = String((err && err.message) || err);
  return /premature close|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|UND_ERR/i.test(m);
}

export async function retryFetch(fetchFn, url, opts = {}, cfg = {}) {
  const retries = Number(process.env.FETCH_RETRIES ?? 3);
  const baseDelayMs = Number(process.env.FETCH_BASE_DELAY_MS ?? 1000);
  const timeoutMs = Number(process.env.FETCH_TIMEOUT_MS ?? 30000);
  const onRetry = cfg.onRetry || (() => {});

  let attempt = 0;
  while (true) {
    attempt += 1;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(new Error('Fetch timeout')), timeoutMs);

    try {
      const res = await fetchFn(url, { ...opts, signal: ac.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      return res;
    } catch (err) {
      clearTimeout(t);
      const canRetry = attempt <= retries && isTransient(err);
      if (!canRetry) throw err;

      const backoff = baseDelayMs * 2 ** (attempt - 1);
      onRetry({ attempt, backoff, err });
      await delay(backoff);
    }
  }
}
