import { createTtlCache, fetchJson, fetchText, logFallback, raw, runLimited, toNumber } from "./providerUtils.mjs";

const cache = createTtlCache(60 * 60 * 1000);
let twseSnapshot = null;
let tpexSnapshot = null;

export async function getFundamentalsBatch(resolvedTickers) {
  const entries = Object.entries(resolvedTickers);
  const values = await runLimited(entries, 4, async ([symbol, resolved]) => [symbol, await getFundamentals(resolved)]);
  return Object.fromEntries(values);
}

export async function getFundamentals(resolved) {
  const cached = cache.get(resolved.symbol);
  if (cached) return cached;

  const failures = [];
  const providers = [
    ["TWSE OpenAPI", () => twseFundamentals(resolved)],
    ["TPEX API", () => tpexFundamentals(resolved)],
    ["Yahoo Finance", () => yahooFundamentals(resolved)],
    ["TradingView", () => tradingViewFundamentals(resolved)],
    ["WantGoo", () => wantgooFundamentals(resolved)]
  ];

  let merged = { eps: null, pe: null, forwardPe: null, source: null };
  for (const [name, provider] of providers) {
    try {
      const result = await provider();
      merged = {
        eps: merged.eps ?? result.eps ?? null,
        pe: merged.pe ?? result.pe ?? null,
        forwardPe: merged.forwardPe ?? result.forwardPe ?? null,
        source: merged.source || (result.eps !== null || result.pe !== null || result.forwardPe !== null ? name : null)
      };
      if (merged.eps !== null && merged.pe !== null && merged.forwardPe !== null) break;
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      logFallback(resolved.symbol, name, error);
    }
  }

  const dataStatus = merged.eps !== null || merged.pe !== null ? "ok" : "fundamentals_missing";
  return cache.set(resolved.symbol, { ...merged, dataStatus, failedProviders: failures });
}

async function twseFundamentals(resolved) {
  if (resolved.market !== "TWSE") throw new Error("not TWSE");
  const snapshot = await loadTwseSnapshot();
  const row = snapshot[resolved.symbol];
  if (!row) throw new Error("TWSE row missing");
  return {
    eps: null,
    pe: toNumber(row.PEratio || row["本益比"]),
    forwardPe: null
  };
}

async function tpexFundamentals(resolved) {
  if (resolved.market !== "TPEX") throw new Error("not TPEX");
  const snapshot = await loadTpexSnapshot();
  const row = snapshot[resolved.symbol];
  if (!row) throw new Error("TPEX row missing");
  return {
    eps: null,
    pe: toNumber(row.PEratio || row.PE || row["本益比"]),
    forwardPe: null
  };
}

async function yahooFundamentals(resolved) {
  const modules = "defaultKeyStatistics,summaryDetail,financialData";
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(resolved.yahooSymbol)}?modules=${modules}`;
  const result = (await fetchJson(url, { timeoutMs: 7000, retries: 1, label: `Yahoo fundamentals ${resolved.symbol}` })).quoteSummary?.result?.[0] || {};
  return {
    eps: raw(result.defaultKeyStatistics?.trailingEps) ?? raw(result.financialData?.epsTrailingTwelveMonths),
    pe: raw(result.summaryDetail?.trailingPE) ?? raw(result.defaultKeyStatistics?.trailingPE),
    forwardPe: raw(result.summaryDetail?.forwardPE) ?? raw(result.defaultKeyStatistics?.forwardPE)
  };
}

async function tradingViewFundamentals(resolved) {
  const html = await fetchText(`https://www.tradingview.com/symbols/TWSE-${resolved.symbol}/financials-overview/`, {
    timeoutMs: 7000,
    retries: 0,
    label: `TradingView ${resolved.symbol}`,
    headers: { "user-agent": "Mozilla/5.0" }
  });
  return {
    eps: toNumber(html.match(/"earnings_per_share_basic_ttm"[^0-9-]*(-?[\d.]+)/)?.[1]),
    pe: toNumber(html.match(/"price_earnings_ttm"[^0-9-]*(-?[\d.]+)/)?.[1]),
    forwardPe: null
  };
}

async function wantgooFundamentals(resolved) {
  const html = await fetchText(`https://www.wantgoo.com/stock/${resolved.symbol}`, {
    timeoutMs: 7000,
    retries: 0,
    label: `WantGoo fundamentals ${resolved.symbol}`,
    headers: { "user-agent": "Mozilla/5.0" }
  });
  return {
    eps: toNumber(html.match(/EPS[^0-9-]*(-?[\d.]+)/i)?.[1]),
    pe: toNumber(html.match(/本益比[^0-9-]*(-?[\d.]+)/)?.[1] || html.match(/PE[^0-9-]*(-?[\d.]+)/i)?.[1]),
    forwardPe: null
  };
}

async function loadTwseSnapshot() {
  if (twseSnapshot) return twseSnapshot;
  const data = await fetchJson("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", {
    timeoutMs: 7000,
    retries: 1,
    label: "TWSE fundamentals snapshot"
  });
  twseSnapshot = Object.fromEntries(data.map((row) => [row.Code || row["證券代號"], row]).filter(([symbol]) => symbol));
  return twseSnapshot;
}

async function loadTpexSnapshot() {
  if (tpexSnapshot) return tpexSnapshot;
  const data = await fetchJson("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes", {
    timeoutMs: 7000,
    retries: 1,
    label: "TPEX fundamentals snapshot"
  });
  tpexSnapshot = Object.fromEntries(data.map((row) => [row.SecuritiesCompanyCode || row.Code || row["代號"], row]).filter(([symbol]) => symbol));
  return tpexSnapshot;
}
