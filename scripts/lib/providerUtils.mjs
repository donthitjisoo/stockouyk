export function createTtlCache(ttlMs) {
  const store = new Map();
  return {
    get(key) {
      const cached = store.get(key);
      if (!cached || cached.expiresAt < Date.now()) return undefined;
      return cached.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    }
  };
}

export async function withTimeout(task, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${label} timeout`)), timeoutMs);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, { timeoutMs = 6000, retries = 1, label = url, headers } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await withTimeout(async (signal) => {
        const response = await fetch(url, { signal, headers });
        if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
        return response.json();
      }, timeoutMs, label);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(350 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function fetchText(url, { timeoutMs = 6000, retries = 1, label = url, headers } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await withTimeout(async (signal) => {
        const response = await fetch(url, { signal, headers });
        if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
        return response.text();
      }, timeoutMs, label);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(350 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function runLimited(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function mergeStatuses(priceStatus, fundamentalsStatus, resolverStatus) {
  if (resolverStatus === "resolver_failed") return "resolver_failed";
  if (priceStatus === "api_error" || fundamentalsStatus === "api_error") return "api_error";
  if (priceStatus === "price_missing") return "price_missing";
  if (fundamentalsStatus === "fundamentals_missing") return "fundamentals_missing";
  if (priceStatus !== "ok" || fundamentalsStatus !== "ok") return "partial_data";
  return "ok";
}

export function logFallback(symbol, provider, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[fallback] ${symbol} ${provider}: ${message}`);
}

export function raw(value) {
  if (typeof value === "number") return value;
  if (value && typeof value.raw === "number") return value.raw;
  return null;
}

export function toNumber(value) {
  const text = String(value ?? "").replaceAll(",", "").trim();
  if (!text || text === "-" || text === "--" || text.toLowerCase() === "nan") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
