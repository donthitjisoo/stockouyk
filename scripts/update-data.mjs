import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const publicDataDir = new URL("../public/data/", import.meta.url);
const fundamentalsSource = new URL("../data/fundamentals/fundamentals.json", import.meta.url);
const recommendationAnalyticsSource = new URL("../public/data/recommendation-analytics.json", import.meta.url);

await mkdir(publicDataDir, { recursive: true });

const watchlist = await readJson(new URL("../watchlist.json", import.meta.url), []);
const watchedCodes = uniqueCodes(watchlist.map((stock) => stock.code));
const fundamentals = await readJson(fundamentalsSource, {});
const recommendationAnalytics = await readJson(recommendationAnalyticsSource, {});

const dailyQuotes = await fetchDailyQuotes();
const quoteMap = new Map(dailyQuotes.map((quote) => [quote.symbol, quote]));
const liveQuotes = await fetchLiveQuotes(watchedCodes);
liveQuotes.forEach((quote, symbol) => quoteMap.set(symbol, { ...quoteMap.get(symbol), ...quote }));
const historicalPrices = await fetchHistoricalPrices(watchedCodes);

const quotes = [...quoteMap.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
const history = buildHistory(quotes, watchedCodes, historicalPrices);

const marketSnapshot = {
  updatedAt: new Date().toISOString(),
  source: "TWSE/TPEx OpenAPI + watched live quotes via GitHub Actions",
  quotes
};

await writeJson(new URL("stocks.json", publicDataDir), marketSnapshot);
await writeJson(new URL("fundamentals.json", publicDataDir), normalizeFundamentals(fundamentals, quoteMap));
await writeJson(new URL("history.json", publicDataDir), history);
await writeJson(new URL("recommendation-analytics.json", publicDataDir), recommendationAnalytics);

// Compatibility for the older non-React app and quick inspection.
await writeJson(new URL("../quotes.json", import.meta.url), {
  updatedAt: marketSnapshot.updatedAt,
  source: marketSnapshot.source,
  quotes: quotes.map((quote) => ({
    code: quote.symbol,
    name: quote.name,
    last: quote.currentPrice,
    changePercent: quote.changePercent,
    volume: quote.volume,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    time: quote.tradeDate,
    source: quote.source
  }))
});

async function fetchDailyQuotes() {
  const [listed, otc] = await Promise.all([fetchListedDaily(), fetchOtcDaily()]);
  return [...listed, ...otc].filter((quote) => /^\d{4}$/.test(quote.symbol));
}

async function fetchListedDaily() {
  const response = await fetchJson("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
  return response
    .map((item) => {
      const currentPrice = cleanPrice(item.ClosingPrice);
      const previousClose = numberOrNull(item.PreviousClose) || numberOrNull(item.OpeningPrice);
      return {
        symbol: String(item.Code || "").trim(),
        name: String(item.Name || "").trim(),
        currentPrice,
        previousClose,
        changePercent: previousClose && currentPrice ? ((currentPrice - previousClose) / previousClose) * 100 : 0,
        volume: numberOrNull(item.TradeVolume),
        open: cleanPrice(item.OpeningPrice),
        high: cleanPrice(item.HighestPrice),
        low: cleanPrice(item.LowestPrice),
        tradeDate: String(item.Date || "").trim(),
        source: "TWSE OpenAPI"
      };
    })
    .filter((quote) => quote.symbol && quote.name && quote.currentPrice > 0);
}

async function fetchOtcDaily() {
  const response = await fetchJson("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes");
  return response
    .map((item) => {
      const currentPrice = cleanPrice(item.Close);
      const previousClose = inferPreviousClose(currentPrice, item.Change);
      return {
        symbol: String(item.SecuritiesCompanyCode || "").trim(),
        name: String(item.CompanyName || "").trim(),
        currentPrice,
        previousClose,
        changePercent: previousClose && currentPrice ? ((currentPrice - previousClose) / previousClose) * 100 : 0,
        volume: numberOrNull(item.TradingShares),
        open: cleanPrice(item.Open),
        high: cleanPrice(item.High),
        low: cleanPrice(item.Low),
        tradeDate: String(item.Date || "").trim(),
        source: "TPEx OpenAPI"
      };
    })
    .filter((quote) => quote.symbol && quote.name && quote.currentPrice > 0);
}

async function fetchLiveQuotes(stockCodes) {
  const providers = [
    { name: "TWSE MIS", fetchQuotes: fetchTwseQuotes },
    { name: "Yahoo Finance", fetchQuotes: fetchYahooQuotes }
  ];
  const quotes = new Map();

  for (const provider of providers) {
    const missingCodes = stockCodes.filter((code) => !quotes.has(code));
    if (missingCodes.length === 0) break;

    try {
      const providerQuotes = await provider.fetchQuotes(missingCodes);
      providerQuotes.forEach((quote, symbol) => {
        if (!quotes.has(symbol)) quotes.set(symbol, quote);
      });
    } catch (error) {
      console.warn(`${provider.name} failed: ${error.message}`);
    }
  }

  return quotes;
}

async function fetchTwseQuotes(stockCodes) {
  const quotes = new Map();
  for (const group of chunk(stockCodes, 80)) {
    const channels = group.flatMap((code) => [`tse_${code}.tw`, `otc_${code}.tw`]).join("|");
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channels)}&json=1&delay=0&_=${Date.now()}`;
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 stock-analytics-platform/1.0",
        referer: "https://mis.twse.com.tw/stock/index.jsp"
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload.msgArray) ? payload.msgArray : [];
    items.map(toTwseQuote).filter((quote) => quote.symbol).forEach((quote) => quotes.set(quote.symbol, quote));
  }
  return quotes;
}

async function fetchYahooQuotes(stockCodes) {
  const entries = await Promise.all(stockCodes.map(fetchYahooQuote));
  return new Map(entries.filter(Boolean).map((quote) => [quote.symbol, quote]));
}

async function fetchYahooQuote(symbol) {
  for (const suffix of [".TW", ".TWO"]) {
    const quote = await fetchYahooSymbol(symbol, `${symbol}${suffix}`);
    if (quote) return quote;
  }
  return null;
}

async function fetchYahooSymbol(symbol, yahooSymbol) {
  let payload = null;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    const response = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=6mo`, {
      headers: { "user-agent": "Mozilla/5.0 stock-analytics-platform/1.0" }
    });
    if (!response.ok) continue;
    payload = await response.json();
    break;
  }

  const result = payload?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const currentPrice = numberOrNull(meta.regularMarketPrice) || lastNumber(quote.close);
  const previousClose = numberOrNull(meta.chartPreviousClose) || numberOrNull(meta.previousClose);
  if (!currentPrice) return null;

  return {
    symbol,
    name: meta.shortName || meta.symbol || symbol,
    currentPrice,
    previousClose,
    changePercent: previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0,
    volume: numberOrNull(meta.regularMarketVolume) || lastNumber(quote.volume),
    open: lastNumber(quote.open),
    high: maxNumber(quote.high),
    low: minNumber(quote.low),
    tradeDate: new Date((lastNumber(result.timestamp) || Date.now() / 1000) * 1000).toISOString(),
    source: "Yahoo Finance"
  };
}

async function fetchHistoricalPrices(stockCodes) {
  const entries = await Promise.all(stockCodes.map(fetchYahooHistory));
  return new Map(entries.filter((entry) => entry.history.length > 0).map((entry) => [entry.symbol, entry.history]));
}

async function fetchYahooHistory(symbol) {
  for (const suffix of [".TW", ".TWO"]) {
    const yahooSymbol = `${symbol}${suffix}`;
    for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
      const response = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=6mo`, {
        headers: { "user-agent": "Mozilla/5.0 stock-analytics-platform/1.0" }
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const result = payload?.chart?.result?.[0];
      const timestamps = result?.timestamp || [];
      const quote = result?.indicators?.quote?.[0] || {};
      const history = timestamps
        .map((timestamp, index) => ({
          date: new Date(timestamp * 1000).toISOString().slice(0, 10),
          close: numberOrNull(quote.close?.[index]) || 0,
          open: numberOrNull(quote.open?.[index]),
          high: numberOrNull(quote.high?.[index]),
          low: numberOrNull(quote.low?.[index]),
          volume: numberOrNull(quote.volume?.[index])
        }))
        .filter((point) => point.close > 0);
      if (history.length > 0) return { symbol, history };
    }
  }
  return { symbol, history: [] };
}

function buildHistory(quotes, watchedCodes, historicalPrices) {
  const watched = new Set(watchedCodes);
  const history = {};
  quotes.forEach((quote) => {
    if (!watched.has(quote.symbol)) return;
    history[quote.symbol] = historicalPrices.get(quote.symbol) || synthesizeHistory(quote);
  });
  return history;
}

function synthesizeHistory(quote) {
  const points = [];
  const current = quote.currentPrice;
  const low = quote.low || current * 0.97;
  const high = quote.high || current * 1.03;
  const range = Math.max(high - low, current * 0.02);
  for (let index = 89; index >= 0; index -= 1) {
    const trend = 1 - index * 0.0015;
    const cycle = Math.sin(index / 5) * range * 0.18;
    const close = Math.max(current * trend + cycle, current * 0.5);
    const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    points.push({
      date,
      close: round(close),
      open: round(close * 0.995),
      high: round(close * 1.012),
      low: round(close * 0.988),
      volume: quote.volume
    });
  }
  points[points.length - 1].close = current;
  return points;
}

function normalizeFundamentals(fundamentals, quoteMap) {
  return Object.fromEntries(
    Object.entries(fundamentals).map(([symbol, item]) => {
      const quote = quoteMap.get(symbol);
      const epsEstimate = numberOrNull(item.epsEstimate) || numberOrNull(item.eps) || 0;
      return [
        symbol,
        {
          symbol,
          epsEstimate,
          pe: numberOrNull(item.pe) || (quote?.currentPrice && epsEstimate ? quote.currentPrice / epsEstimate : 0),
          forwardPe: numberOrNull(item.forwardPe) || (quote?.currentPrice && epsEstimate ? quote.currentPrice / epsEstimate : 0),
          marketCap: numberOrNull(item.marketCap),
          sector: item.sector || "",
          updatedAt: new Date().toISOString(),
          source: "static fundamentals"
        }
      ];
    })
  );
}

function toTwseQuote(item) {
  const currentPrice = firstValid(item.z, item.a?.split("_")[0], item.b?.split("_")[0], item.y);
  const previousClose = numberOrNull(item.y);
  const latest = numberOrNull(currentPrice);
  return {
    symbol: item.c || "",
    name: item.n || "",
    currentPrice: latest || 0,
    previousClose,
    changePercent: previousClose && latest ? ((latest - previousClose) / previousClose) * 100 : 0,
    volume: numberOrNull(item.v),
    open: numberOrNull(firstValid(item.o)),
    high: numberOrNull(firstValid(item.h)),
    low: numberOrNull(firstValid(item.l)),
    tradeDate: `${item.d || ""} ${item.t || ""}`.trim(),
    source: "TWSE MIS"
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 stock-analytics-platform/1.0" }
  });
  if (!response.ok) throw new Error(`${url} failed: HTTP ${response.status}`);
  return response.json();
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(url, value) {
  await writeFile(url, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueCodes(values) {
  return [...new Set(values.map((value) => String(value || "").match(/\d{4,6}/)?.[0]).filter(Boolean))];
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function cleanPrice(value) {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text || text === "--") return 0;
  return numberOrNull(text) || 0;
}

function inferPreviousClose(currentPrice, change) {
  const numericChange = numberOrNull(String(change || "").replace("+", ""));
  if (!currentPrice || !numericChange) return undefined;
  return currentPrice - numericChange;
}

function firstValid(...values) {
  return values.find((value) => value && value !== "-" && value !== "_") || "";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

function lastNumber(values = []) {
  return [...values].reverse().map(numberOrNull).find((value) => value !== undefined);
}

function maxNumber(values = []) {
  const numbers = values.map(numberOrNull).filter((value) => value !== undefined);
  return numbers.length > 0 ? Math.max(...numbers) : undefined;
}

function minNumber(values = []) {
  const numbers = values.map(numberOrNull).filter((value) => value !== undefined);
  return numbers.length > 0 ? Math.min(...numbers) : undefined;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
