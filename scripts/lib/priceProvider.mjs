import { createTtlCache, fetchJson, fetchText, logFallback, runLimited, toNumber } from "./providerUtils.mjs";

const quoteCache = createTtlCache(5 * 60 * 1000);
let twseSnapshot = null;
let tpexSnapshot = null;

export async function getQuoteBatch(resolvedTickers) {
  const entries = Object.entries(resolvedTickers);
  const values = await runLimited(entries, 5, async ([symbol, resolved]) => [symbol, await getQuote(resolved)]);
  return Object.fromEntries(values);
}

export async function getHistoryBatch(resolvedTickers, earliestDateBySymbol) {
  const entries = Object.entries(resolvedTickers);
  const values = await runLimited(entries, 4, async ([symbol, resolved]) => [symbol, await getHistory(resolved, earliestDateBySymbol[symbol])]);
  return Object.fromEntries(values);
}

export async function getQuote(resolved) {
  const cached = quoteCache.get(resolved.symbol);
  if (cached) return cached;

  const failures = [];
  const providers = [
    ["Yahoo Finance chart", () => yahooChartQuote(resolved)],
    ["Yahoo scraper", () => yahooScraperQuote(resolved)],
    ["TWSE API", () => twseQuote(resolved)],
    ["TPEX API", () => tpexQuote(resolved)],
    ["TWSE public data", () => twseQuote(resolved)],
    ["WantGoo", () => wantgooQuote(resolved)]
  ];

  for (const [name, provider] of providers) {
    try {
      const quote = await provider();
      if (quote.currentPrice !== null && quote.currentPrice > 0) {
        return quoteCache.set(resolved.symbol, {
          ...baseQuote(resolved),
          ...quote,
          source: name,
          dataStatus: "ok",
          failedProviders: failures,
          updatedAt: new Date().toISOString()
        });
      }
      failures.push(`${name}: empty price`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      logFallback(resolved.symbol, name, error);
    }
  }

  return quoteCache.set(resolved.symbol, {
    ...baseQuote(resolved),
    currentPrice: null,
    previousClose: null,
    change: null,
    changePercent: null,
    source: null,
    dataStatus: "price_missing",
    failedProviders: failures,
    updatedAt: new Date().toISOString()
  });
}

export async function getHistory(resolved, fromDate) {
  try {
    const chart = await fetchYahooChart(resolved.yahooSymbol, fromDate);
    return chart.rows.map((row) => ({ ...row, symbol: resolved.symbol }));
  } catch (error) {
    logFallback(resolved.symbol, "Yahoo history", error);
    return [];
  }
}

async function yahooChartQuote(resolved) {
  const chart = await fetchYahooChart(resolved.yahooSymbol);
  const meta = chart.meta || {};
  const currentPrice = toNumber(meta.regularMarketPrice) ?? lastClose(chart.rows);
  const previousClose = toNumber(meta.previousClose) ?? previousCloseFromRows(chart.rows);
  return withChange({ currentPrice, previousClose });
}

async function yahooScraperQuote(resolved) {
  const html = await fetchText(`https://finance.yahoo.com/quote/${encodeURIComponent(resolved.yahooSymbol)}`, {
    timeoutMs: 7000,
    retries: 1,
    label: `Yahoo scraper ${resolved.symbol}`,
    headers: { "user-agent": "Mozilla/5.0" }
  });
  const price = html.match(/regularMarketPrice[^{]+?\{"raw":([\d.]+)/)?.[1]
    || html.match(/"regularMarketPrice":\{"raw":([\d.]+)/)?.[1];
  const previous = html.match(/regularMarketPreviousClose[^{]+?\{"raw":([\d.]+)/)?.[1]
    || html.match(/"regularMarketPreviousClose":\{"raw":([\d.]+)/)?.[1];
  return withChange({ currentPrice: toNumber(price), previousClose: toNumber(previous) });
}

async function twseQuote(resolved) {
  if (resolved.market !== "TWSE") throw new Error("not TWSE");
  const snapshot = await loadTwseSnapshot();
  const row = snapshot[resolved.symbol];
  if (!row) throw new Error("TWSE row missing");
  return withChange({
    currentPrice: toNumber(row.ClosingPrice || row["收盤價"] || row.Close),
    previousClose: toNumber(row.ClosingPrice ? Number(row.ClosingPrice) - Number(row.Change || 0) : null)
  });
}

async function tpexQuote(resolved) {
  if (resolved.market !== "TPEX") throw new Error("not TPEX");
  const snapshot = await loadTpexSnapshot();
  const row = snapshot[resolved.symbol];
  if (!row) throw new Error("TPEX row missing");
  return withChange({
    currentPrice: toNumber(row.Close || row.ClosingPrice || row["收盤"]),
    previousClose: toNumber(row.Close ? Number(row.Close) - Number(row.Change || 0) : null)
  });
}

async function wantgooQuote(resolved) {
  const html = await fetchText(`https://www.wantgoo.com/stock/${resolved.symbol}`, {
    timeoutMs: 7000,
    retries: 0,
    label: `WantGoo ${resolved.symbol}`,
    headers: { "user-agent": "Mozilla/5.0" }
  });
  const price = html.match(/"close"\s*:\s*([\d.]+)/i)?.[1]
    || html.match(/"price"\s*:\s*([\d.]+)/i)?.[1]
    || html.match(/現價[^0-9]*([\d.]+)/)?.[1];
  return withChange({ currentPrice: toNumber(price), previousClose: null });
}

async function fetchYahooChart(yahooSymbol, fromDate) {
  const params = fromDate
    ? `period1=${Math.floor(new Date(`${normalizeDate(fromDate)}T00:00:00+08:00`).getTime() / 1000)}&period2=${Math.floor(Date.now() / 1000)}`
    : "range=5d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${params}&interval=1d`;
  const payload = await fetchJson(url, { timeoutMs: 7000, retries: 1, label: `Yahoo chart ${yahooSymbol}` });
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  return {
    meta: result?.meta || {},
    rows: timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: toNumber(quote?.open?.[index]) ?? 0,
      high: toNumber(quote?.high?.[index]) ?? 0,
      low: toNumber(quote?.low?.[index]) ?? 0,
      close: toNumber(quote?.close?.[index]) ?? 0,
      volume: toNumber(quote?.volume?.[index]) ?? 0
    })).filter((row) => row.close || row.high)
  };
}

async function loadTwseSnapshot() {
  if (twseSnapshot) return twseSnapshot;
  const data = await fetchJson("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", {
    timeoutMs: 7000,
    retries: 1,
    label: "TWSE quote snapshot"
  });
  twseSnapshot = Object.fromEntries(data.map((row) => [row.Code || row["證券代號"], row]).filter(([symbol]) => symbol));
  return twseSnapshot;
}

async function loadTpexSnapshot() {
  if (tpexSnapshot) return tpexSnapshot;
  const data = await fetchJson("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes", {
    timeoutMs: 7000,
    retries: 1,
    label: "TPEX quote snapshot"
  });
  tpexSnapshot = Object.fromEntries(data.map((row) => [row.SecuritiesCompanyCode || row.Code || row["代號"], row]).filter(([symbol]) => symbol));
  return tpexSnapshot;
}

function baseQuote(resolved) {
  return {
    symbol: resolved.symbol,
    yahooSymbol: resolved.yahooSymbol,
    name: resolved.name || resolved.symbol,
    market: resolved.market,
    marketName: resolved.marketName,
    sector: resolved.sector || "其他"
  };
}

function withChange({ currentPrice, previousClose }) {
  const normalizedPreviousClose = previousClose && previousClose > 0 ? previousClose : null;
  const change = currentPrice !== null && normalizedPreviousClose !== null ? currentPrice - normalizedPreviousClose : null;
  return {
    currentPrice,
    previousClose: normalizedPreviousClose,
    change,
    changePercent: change !== null && normalizedPreviousClose ? (change / normalizedPreviousClose) * 100 : null
  };
}

function lastClose(rows) {
  return rows.filter((row) => row.close).at(-1)?.close ?? null;
}

function previousCloseFromRows(rows) {
  return rows.filter((row) => row.close).at(-2)?.close ?? null;
}

function normalizeDate(value) {
  const text = String(value || "").trim().replaceAll("/", "-");
  const [year, month, day] = text.split("-");
  if (!year || !month || !day) return text;
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
