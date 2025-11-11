// retry-fetch.js
const { setTimeout: delay } = require('timers/promises');

function isTransient(err) {
  const m = String(err && err.message || err);
  // Covers TLS resets, timeouts, DNS hiccups, and your specific error
  return /premature close|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR|socket hang up|network/i.test(m);
}

async function retryFetch(fetchFn, url, opts = {}, cfg = {}) {
  const {
    retries = Number(process.env.FETCH_RETRIES || 3),
    baseDelayMs = Number(process.env.FETCH_BASE_DELAY_MS || 1000),
    timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 30000),
    onRetry = () => {},
  } = cfg;

  let attempt = 0;
  while (true) {
    attempt += 1;

    // Per-call timeout using AbortController
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(new Error('Fetch timeout')), timeoutMs);

    try {
      const res = await fetchFn(url, { ...opts, signal: ac.signal });
      clearTimeout(t);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      return res;
    } catch (err) {
      clearTimeout(t);
      const canRetry = attempt <= retries && isTransient(err);
      if (!canRetry) throw err;

      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      onRetry({ attempt, backoff, err });
      await delay(backoff);
    }
  }
}

module.exports = { retryFetch, isTransient };
