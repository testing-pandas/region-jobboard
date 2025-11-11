export function isTransient(err) {
  const m = String(err && err.message || err);
  return /premature close|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR|socket hang up|network/i.test(m);
}

export async function retryFetch(fetchFn, url, opts = {}, cfg = {}) {
  const { setTimeout: delay } = await import('node:timers/promises');

  const {
    retries = Number(process.env.FETCH_RETRIES || 3),
    baseDelayMs = Number(process.env.FETCH_BASE_DELAY_MS || 1000),
    timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 30000),
    onRetry = () => {},
  } = cfg;

  let attempt = 0;
  while (true) {
    attempt += 1;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchFn(url, { ...opts, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} on ${url}`);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (!(attempt < retries && isTransient(err))) throw err;

      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      onRetry({ attempt, backoff, err });
      await delay(backoff);
    }
  }
}
