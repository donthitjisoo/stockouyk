import { normalizeRating, ratingRank } from "./rating";
import type { RecommendationCsvRecord, StockRow } from "../types";

export const CSV_HEADERS = ["date", "symbol", "target_price", "recommender", "recommendation_rating", "target_reached", "reached_days"] as const;
const REQUIRED_HEADERS = ["date", "symbol", "target_price", "recommender", "target_reached", "reached_days"] as const;

export function parseRecommendationCsv(text: string): RecommendationCsvRecord[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((cell) => cell.trim().toLowerCase());
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => indexes[header] === undefined);
  if (missing.length) throw new Error(`CSV 缺少欄位：${missing.join(", ")}`);

  return rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row, index) => {
    const symbol = row[indexes.symbol]?.match(/\d{4,6}/)?.[0] || "";
    const targetPrice = Number(row[indexes.target_price]);
    if (!symbol) throw new Error(`第 ${index + 2} 列股票代號格式錯誤`);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) throw new Error(`第 ${index + 2} 列目標價格式錯誤`);
    return {
      date: row[indexes.date]?.trim() || "",
      symbol,
      targetPrice,
      recommender: row[indexes.recommender]?.trim() || "",
      recommendationRating: normalizeRating(indexes.recommendation_rating === undefined ? "" : row[indexes.recommendation_rating]),
      targetReached: parseBoolean(row[indexes.target_reached]),
      reachedDays: optionalNumber(row[indexes.reached_days])
    };
  });
}

export function rowsToRecommendationCsv(rows: StockRow[]) {
  const body = rows.map((row) =>
    [
      row.date,
      row.symbol,
      row.targetPrice,
      row.recommender,
      row.recommendationRating,
      row.targetReached ? "true" : "false",
      row.reachedDays ?? ""
    ].map(csvCell).join(",")
  );
  return [[...CSV_HEADERS].join(","), ...body].join("\n");
}

export function uploadedRecordsToRows(records: RecommendationCsvRecord[], knownRows: StockRow[], watchlistId: string, watchlistName: string): StockRow[] {
  const latestBySymbol = new Map<string, StockRow>();
  for (const row of knownRows) latestBySymbol.set(row.symbol, row);

  return records.map((record, index) => {
    const known = latestBySymbol.get(record.symbol);
    const currentPrice = known?.currentPrice ?? null;
    const recommendedPrice = known?.recommendedPrice ?? currentPrice;
    const targetReached = record.targetReached || (currentPrice !== null && currentPrice > 0 && currentPrice >= record.targetPrice);
    return {
      id: `upload-${watchlistId}-${record.symbol}-${index}`,
      watchlistId,
      watchlistName,
      date: record.date,
      symbol: record.symbol,
      name: known?.name ?? record.symbol,
      market: known?.market ?? "UNKNOWN",
      marketName: known?.marketName ?? "未知",
      yahooSymbol: known?.yahooSymbol ?? `${record.symbol}.TW`,
      sector: known?.sector ?? "其他",
      recommender: record.recommender,
      recommendationRating: normalizeRating(record.recommendationRating),
      ratingRank: ratingRank(record.recommendationRating),
      targetPrice: record.targetPrice,
      recommendedPrice,
      currentPrice,
      eps: known?.eps ?? null,
      pe: known?.pe ?? null,
      forwardPe: known?.forwardPe ?? null,
      previousClose: known?.previousClose ?? null,
      change: known?.change ?? null,
      changePercent: known?.changePercent ?? null,
      recommendationReturnPct: pct((currentPrice ?? 0) - (recommendedPrice ?? 0), recommendedPrice),
      remainingUpsidePct: pct(record.targetPrice - (currentPrice ?? 0), currentPrice),
      recommendationGapPct: pct((currentPrice ?? 0) - (recommendedPrice ?? 0), recommendedPrice),
      distanceToTargetPct: pct(record.targetPrice - (currentPrice ?? 0), currentPrice),
      potentialReturnPct: pct(record.targetPrice - (currentPrice ?? 0), currentPrice),
      instantReturnPct: pct((currentPrice ?? 0) - (recommendedPrice ?? 0), recommendedPrice),
      recommendationUpsidePct: pct(record.targetPrice - (recommendedPrice ?? 0), recommendedPrice),
      elapsedTradingDays: known?.elapsedTradingDays ?? 0,
      targetReached,
      reachedDays: record.targetReached ? record.reachedDays : targetReached ? known?.elapsedTradingDays ?? null : null,
      sourceTargetReached: record.targetReached,
      sourceReachedDays: record.reachedDays,
      dataStatus: known?.dataStatus ?? "partial_data",
      priceStatus: known?.priceStatus ?? (currentPrice === null ? "price_missing" : "ok"),
      fundamentalsStatus: known?.fundamentalsStatus ?? "fundamentals_missing",
      source: known?.source ?? null,
      fundamentalsSource: known?.fundamentalsSource ?? null,
      failedProviders: known?.failedProviders ?? [],
      updatedAt: known?.updatedAt ?? new Date().toISOString()
    };
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

function parseBoolean(value: string) {
  return ["true", "1", "yes", "y", "已達標"].includes(String(value || "").trim().toLowerCase());
}

function optionalNumber(value: string) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function pct(numerator: number, denominator: number | null) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return (numerator / (denominator ?? 0)) * 100;
}
