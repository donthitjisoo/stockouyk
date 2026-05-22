import { promises as fs } from "node:fs";
import path from "node:path";
import { getFundamentalsBatch } from "./lib/fundamentalsProvider.mjs";
import { getHistoryBatch, getQuoteBatch } from "./lib/priceProvider.mjs";
import { isRating, normalizeRating, ratingRank } from "./lib/rating.mjs";
import { mergeStatuses } from "./lib/providerUtils.mjs";
import { guessSector, resolveTaiwanTickers } from "./lib/twStockResolver.mjs";

const root = process.cwd();
const dataDir = path.join(root, "data");
const watchlistDir = path.join(dataDir, "watchlists");
const outputDir = path.join(root, "public", "data");
const REQUIRED_RECOMMENDATION_HEADERS = ["date", "symbol", "target_price", "recommender", "target_reached", "reached_days"];
const RECOMMENDATION_HEADERS = ["date", "symbol", "target_price", "recommender", "recommendation_rating", "target_reached", "reached_days"];

await main();

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const watchlists = await readWatchlists();
  const holdings = await readPortfolio();
  const recommendationSymbols = watchlists.flatMap((watchlist) => watchlist.recommendations.map((row) => row.symbol));
  const portfolioSymbols = holdings.map((row) => row.symbol);
  const symbols = [...new Set([...recommendationSymbols, ...portfolioSymbols])].filter(Boolean);
  const tickerMap = await resolveTaiwanTickers(symbols);
  const earliestBySymbol = Object.fromEntries(symbols.map((symbol) => [symbol, earliestDate(watchlists, symbol)]));

  const [quoteMap, fundamentalsMap, historyMap] = await Promise.all([
    getQuoteBatch(tickerMap),
    getFundamentalsBatch(tickerMap),
    getHistoryBatch(tickerMap, earliestBySymbol)
  ]);

  const enrichedWatchlists = watchlists.map((watchlist) => ({
    ...watchlist,
    stocks: watchlist.recommendations.map((row) =>
      enrichRecommendation(row, tickerMap[row.symbol], quoteMap[row.symbol], fundamentalsMap[row.symbol], historyMap[row.symbol] || [])
    )
  }));

  const stocks = enrichedWatchlists.flatMap((watchlist) =>
    watchlist.stocks.map((stock) => ({ ...stock, watchlistId: watchlist.id, watchlistName: watchlist.name }))
  );
  const enrichedHoldings = holdings.map((holding) =>
    enrichHolding(holding, tickerMap[holding.symbol], quoteMap[holding.symbol], fundamentalsMap[holding.symbol])
  );

  const generatedAt = new Date().toISOString();
  const analytics = calculateAnalytics(enrichedWatchlists, generatedAt);
  const leaderboard = calculateLeaderboard(stocks, generatedAt);
  const portfolio = {
    generatedAt,
    holdings: enrichedHoldings,
    analytics: calculatePortfolioAnalytics(enrichedHoldings)
  };
  const history = {
    generatedAt,
    symbols: Object.fromEntries(Object.entries(historyMap).map(([symbol, rows]) => [symbol, rows.slice(-120)]))
  };

  await writeJson("stocks.json", { generatedAt, watchlists: enrichedWatchlists, stocks });
  await writeJson("analytics.json", analytics);
  await writeJson("leaderboard.json", leaderboard);
  await writeJson("history.json", history);
  await writeJson("portfolio.json", portfolio);
  await writeJson("manifest.json", {
    generatedAt,
    files: ["stocks.json", "analytics.json", "leaderboard.json", "history.json", "portfolio.json"],
    source: "data/recommendations.csv"
  });
}

async function readWatchlists() {
  const watchlists = [];
  const defaultCsv = await readRecommendationCsv(path.join(dataDir, "recommendations.csv"));
  watchlists.push({ id: "default", name: "總表", source: "data/recommendations.csv", recommendations: defaultCsv });

  const files = await fs.readdir(watchlistDir).catch(() => []);
  for (const file of files.filter((name) => name.endsWith(".csv")).sort()) {
    const filePath = path.join(watchlistDir, file);
    const name = path.basename(file, ".csv");
    watchlists.push({
      id: slug(name),
      name,
      source: `data/watchlists/${file}`,
      recommendations: await readRecommendationCsv(filePath)
    });
  }
  return watchlists;
}

async function readRecommendationCsv(filePath) {
  const rows = await readCsv(filePath);
  if (rows.length === 0) return [];
  const headers = rows[0].map((cell) => cell.trim().toLowerCase());
  const missing = REQUIRED_RECOMMENDATION_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`${filePath} 缺少欄位：${missing.join(", ")}`);
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));

  return rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row, index) => {
    const symbol = normalizeSymbol(row[indexes.symbol]);
    const targetPrice = Number(row[indexes.target_price]);
    const recommenderCell = row[indexes.recommender]?.trim() || "";
    const ratingCell = indexes.recommendation_rating === undefined ? "" : row[indexes.recommendation_rating]?.trim() || "";
    const inferredRating = ratingCell || (isRating(recommenderCell) ? recommenderCell : "B");
    const recommender = isRating(recommenderCell) && !ratingCell ? "" : recommenderCell;
    if (!symbol) throw new Error(`${filePath} 第 ${index + 2} 列股票代號錯誤`);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) throw new Error(`${filePath} 第 ${index + 2} 列目標價錯誤`);
    return {
      id: `${symbol}-${normalizeDate(row[indexes.date])}-${index}`,
      date: normalizeDate(row[indexes.date]),
      symbol,
      targetPrice,
      recommender,
      recommendationRating: normalizeRating(inferredRating),
      ratingRank: ratingRank(inferredRating),
      sourceTargetReached: parseBoolean(row[indexes.target_reached]),
      sourceReachedDays: optionalNumber(row[indexes.reached_days])
    };
  });
}

async function readPortfolio() {
  const filePath = path.join(dataDir, "portfolio.csv");
  const rows = await readCsv(filePath).catch(() => []);
  if (rows.length === 0) return [];
  const headers = rows[0].map((cell) => cell.trim().toLowerCase());
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  return rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row, index) => ({
    id: row[indexes.id]?.trim() || `holding-${index}`,
    symbol: normalizeSymbol(row[indexes.symbol]),
    shares: numberValue(row[indexes.shares]),
    avgCost: numberValue(row[indexes.avg_cost]),
    broker: row[indexes.broker]?.trim() || "Unknown",
    account: row[indexes.account]?.trim() || "Default"
  })).filter((row) => row.symbol && row.shares > 0);
}

function enrichRecommendation(row, resolved, quote, fundamentals, history) {
  const recommendedPrice = findCloseOnOrBefore(row.date, history) ?? quote.currentPrice ?? null;
  const elapsedTradingDays = countTradingDays(row.date, history);
  const wasReached = row.sourceTargetReached;
  const targetReached = wasReached || (quote.currentPrice !== null && quote.currentPrice >= row.targetPrice);
  const reachedDays = wasReached
    ? row.sourceReachedDays ?? firstReachedDays(row.date, row.targetPrice, history)
    : targetReached
      ? elapsedTradingDays
      : null;
  const dataStatus = mergeStatuses(quote.dataStatus, fundamentals.dataStatus, resolved.dataStatus);

  return {
    id: row.id,
    date: row.date,
    symbol: row.symbol,
    name: quote.name || resolved.name || row.symbol,
    market: quote.market || resolved.market,
    marketName: quote.marketName || resolved.marketName,
    yahooSymbol: quote.yahooSymbol || resolved.yahooSymbol,
    sector: quote.sector || resolved.sector || guessSector(row.symbol),
    recommender: row.recommender || "-",
    recommendationRating: row.recommendationRating,
    ratingRank: row.ratingRank,
    targetPrice: row.targetPrice,
    recommendedPrice,
    currentPrice: quote.currentPrice,
    previousClose: quote.previousClose,
    change: quote.change,
    changePercent: quote.changePercent,
    eps: fundamentals.eps,
    pe: fundamentals.pe,
    forwardPe: fundamentals.forwardPe,
    recommendationReturnPct: pct((quote.currentPrice ?? 0) - (recommendedPrice ?? 0), recommendedPrice),
    remainingUpsidePct: pct(row.targetPrice - (quote.currentPrice ?? 0), quote.currentPrice),
    recommendationGapPct: pct((quote.currentPrice ?? 0) - (recommendedPrice ?? 0), recommendedPrice),
    distanceToTargetPct: pct(row.targetPrice - (quote.currentPrice ?? 0), quote.currentPrice),
    potentialReturnPct: pct(row.targetPrice - (quote.currentPrice ?? 0), quote.currentPrice),
    instantReturnPct: pct((quote.currentPrice ?? 0) - (recommendedPrice ?? 0), recommendedPrice),
    recommendationUpsidePct: pct(row.targetPrice - (recommendedPrice ?? 0), recommendedPrice),
    elapsedTradingDays,
    targetReached,
    reachedDays,
    sourceTargetReached: row.sourceTargetReached,
    sourceReachedDays: row.sourceReachedDays,
    dataStatus,
    priceStatus: quote.dataStatus,
    fundamentalsStatus: fundamentals.dataStatus,
    source: quote.source,
    fundamentalsSource: fundamentals.source,
    failedProviders: [...(quote.failedProviders || []), ...(fundamentals.failedProviders || [])],
    updatedAt: quote.updatedAt || new Date().toISOString()
  };
}

function enrichHolding(holding, resolved, quote, fundamentals) {
  const currentPrice = quote.currentPrice;
  const cost = holding.shares * holding.avgCost;
  const marketValue = currentPrice === null ? 0 : holding.shares * currentPrice;
  const unrealizedPnL = marketValue - cost;
  const dataStatus = mergeStatuses(quote.dataStatus, fundamentals.dataStatus, resolved.dataStatus);
  return {
    ...holding,
    name: quote.name || resolved.name || holding.symbol,
    market: quote.market || resolved.market,
    marketName: quote.marketName || resolved.marketName,
    yahooSymbol: quote.yahooSymbol || resolved.yahooSymbol,
    sector: quote.sector || resolved.sector || guessSector(holding.symbol),
    currentPrice,
    previousClose: quote.previousClose,
    change: quote.change,
    changePercent: quote.changePercent,
    eps: fundamentals.eps,
    pe: fundamentals.pe,
    forwardPe: fundamentals.forwardPe,
    cost,
    marketValue,
    todayPnL: quote.change === null ? 0 : quote.change * holding.shares,
    unrealizedPnL,
    unrealizedPnLPct: pct(unrealizedPnL, cost),
    weight: 0,
    dataStatus,
    failedProviders: [...(quote.failedProviders || []), ...(fundamentals.failedProviders || [])],
    source: quote.source,
    updatedAt: quote.updatedAt || new Date().toISOString()
  };
}

function calculatePortfolioAnalytics(holdings) {
  const totalAssets = sum(holdings.map((row) => row.marketValue));
  const totalCost = sum(holdings.map((row) => row.cost));
  for (const row of holdings) row.weight = pct(row.marketValue, totalAssets);
  const winners = holdings.filter((row) => row.unrealizedPnL > 0);
  const sortedByValue = [...holdings].sort((a, b) => b.marketValue - a.marketValue);
  const sortedByPnl = [...holdings].sort((a, b) => b.unrealizedPnL - a.unrealizedPnL);
  return {
    totalAssets,
    todayPnL: sum(holdings.map((row) => row.todayPnL)),
    unrealizedPnL: sum(holdings.map((row) => row.unrealizedPnL)),
    unrealizedPnLPct: pct(sum(holdings.map((row) => row.unrealizedPnL)), totalCost),
    winRate: pct(winners.length, holdings.length),
    holdingsCount: holdings.length,
    cashRatio: 0,
    largestHolding: sortedByValue[0] || null,
    largestWinner: sortedByPnl[0] || null,
    largestLoser: sortedByPnl.at(-1) || null,
    sectorAllocation: allocation(holdings, "sector"),
    brokerAllocation: allocation(holdings, "broker"),
    accountAllocation: allocation(holdings, "account"),
    pnlRanking: sortedByPnl.slice(0, 12)
  };
}

function calculateAnalytics(watchlists, generatedAt) {
  const byWatchlist = Object.fromEntries(watchlists.map((watchlist) => [watchlist.id, summarize(watchlist.stocks)]));
  const all = watchlists.flatMap((watchlist) => watchlist.stocks);
  return { generatedAt, overall: summarize(all), byWatchlist };
}

function calculateLeaderboard(stocks, generatedAt) {
  const grouped = new Map();
  for (const stock of stocks) {
    if (!grouped.has(stock.recommender)) grouped.set(stock.recommender, []);
    grouped.get(stock.recommender).push(stock);
  }
  const recommenders = [...grouped.entries()].map(([recommender, rows]) => ({
    recommender,
    count: rows.length,
    targetReachedCount: rows.filter((row) => row.targetReached).length,
    hitRate: pct(rows.filter((row) => row.targetReached).length, rows.length),
    avgInstantReturn: avg(rows.map((row) => row.instantReturnPct)),
    avgPotentialReturn: avg(rows.map((row) => row.potentialReturnPct)),
    avgReachedDays: avg(rows.filter((row) => row.reachedDays !== null).map((row) => row.reachedDays))
  })).sort((a, b) => b.hitRate - a.hitRate || b.avgInstantReturn - a.avgInstantReturn);
  return { generatedAt, recommenders };
}

function summarize(rows) {
  const reached = rows.filter((row) => row.targetReached);
  return {
    count: rows.length,
    targetReachedCount: reached.length,
    targetRate: pct(reached.length, rows.length),
    avgReachedDays: avg(reached.map((row) => row.reachedDays).filter((value) => value !== null)),
    avgPotentialReturn: avg(rows.map((row) => row.potentialReturnPct)),
    avgInstantReturn: avg(rows.map((row) => row.instantReturnPct)),
    winRate: pct(rows.filter((row) => row.instantReturnPct > 0).length, rows.length),
    unreachedCount: rows.length - reached.length
  };
}

function allocation(holdings, key) {
  const totals = new Map();
  for (const row of holdings) totals.set(row[key], (totals.get(row[key]) || 0) + row.marketValue);
  const total = sum([...totals.values()]);
  return [...totals.entries()].map(([name, value]) => ({ name, value, weight: pct(value, total) })).sort((a, b) => b.value - a.value);
}

async function readCsv(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return parseCsv(content);
}

function findCloseOnOrBefore(date, history) {
  const rows = history.filter((row) => row.date <= date).sort((a, b) => b.date.localeCompare(a.date));
  return rows[0]?.close ?? null;
}

function countTradingDays(date, history) {
  return history.filter((row) => row.date >= date).length;
}

function firstReachedDays(date, targetPrice, history) {
  const rows = history.filter((row) => row.date >= date).sort((a, b) => a.date.localeCompare(b.date));
  const index = rows.findIndex((row) => row.high >= targetPrice || row.close >= targetPrice);
  return index >= 0 ? index + 1 : null;
}

function earliestDate(watchlists, symbol) {
  const dates = watchlists.flatMap((watchlist) => watchlist.recommendations.filter((row) => row.symbol === symbol).map((row) => row.date)).sort();
  return dates[0] || "2020-01-01";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseBoolean(value) {
  return ["true", "1", "yes", "y", "已達標"].includes(String(value || "").trim().toLowerCase());
}

function optionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function numberValue(value) {
  const number = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(number) ? number : 0;
}

function normalizeSymbol(value) {
  return String(value || "").match(/\d{4,6}/)?.[0] || "";
}

function normalizeDate(value) {
  const text = String(value || "").trim().replaceAll("/", "-");
  const [year, month, day] = text.split("-");
  if (!year || !month || !day) return text;
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function pct(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0 || denominator === null) return 0;
  return (numerator / denominator) * 100;
}

function avg(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  return numbers.length ? sum(numbers) / numbers.length : 0;
}

function sum(values) {
  return values.filter((value) => Number.isFinite(value)).reduce((total, value) => total + value, 0);
}

async function writeJson(fileName, value) {
  await fs.writeFile(path.join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function slug(value) {
  return encodeURIComponent(value).replaceAll("%", "").toLowerCase() || "watchlist";
}

export { RECOMMENDATION_HEADERS };
