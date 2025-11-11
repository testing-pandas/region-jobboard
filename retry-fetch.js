// retry-fetch.js  (ESM)
export function isTransient(err) {
  const msg  = String(err?.message || err || '');
  const code = err?.code || err?.cause?.code;
  const name = err?.name;

  // покриваємо і message, і code, і AbortError (timeout/abort)
  if (code && [
    'ERR_STREAM_PREMATURE_CLOSE',
    'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'
  ].includes(code)) return true;

  if (name === 'AbortError') return true;

  if (/premature close|socket hang up|network|TLS|timeout/i.test(msg)) return true;

  return false;
}

export async function retryFetch(fetchFn, url, opts = {}, cfg = {}) {
  const {
    retries = Number(process.env.FETCH_RETRIES || 10),
    baseDelayMs = Number(process.env.FETCH_BASE_DELAY_MS || 1000),
    timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 30000),
    onRetry = () => {},
  } = cfg;

  let attempt = 0;
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
      const canRetry = attempt < retries && isTransient(err);
      if (!canRetry) {
        // КЛЮЧОВЕ: кидати далі, щоб верхній рівень завершив процес
        throw err;
      }
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      onRetry({ attempt, backoff, err });
      await new Promise(r => setTimeout(r, backoff));
    }
  }
}
