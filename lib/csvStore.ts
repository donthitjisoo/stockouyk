import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { HoldingRecord, PriceHistoryRecord, RecommendationRecord } from "./types";
import { createId, toNumber } from "./utils";

const DATA_DIR = path.join(process.cwd(), "data");

const FILES = {
  recommendations: path.join(DATA_DIR, "recommendations.csv"),
  holdings: path.join(DATA_DIR, "portfolio.csv"),
  priceHistory: path.join(DATA_DIR, "price_history.csv")
};

const HEADERS = {
  recommendations: ["id", "date", "symbol", "target_price", "recommended_price", "recommender", "note"],
  holdings: ["id", "symbol", "shares", "avg_cost", "broker"],
  priceHistory: ["date", "symbol", "open", "high", "low", "close", "volume"]
} as const;

export async function getRecommendations(): Promise<RecommendationRecord[]> {
  const rows = await readCsv(FILES.recommendations);
  return rows.map((row) => ({
    id: stringValue(row.id) || createId("rec"),
    date: stringValue(row.date),
    symbol: normalizeSymbol(row.symbol),
    target_price: toNumber(row.target_price),
    recommended_price: toNumber(row.recommended_price),
    recommender: stringValue(row.recommender),
    note: stringValue(row.note)
  }));
}

export async function createRecommendation(input: Omit<RecommendationRecord, "id">) {
  const rows = await getRecommendations();
  const record: RecommendationRecord = { id: createId("rec"), ...input, symbol: normalizeSymbol(input.symbol) };
  await writeRecommendations([...rows, record]);
  return record;
}

export async function updateRecommendation(id: string, input: Partial<Omit<RecommendationRecord, "id">>) {
  const rows = await getRecommendations();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const next = { ...rows[index], ...input, id, symbol: normalizeSymbol(input.symbol || rows[index].symbol) };
  rows[index] = next;
  await writeRecommendations(rows);
  return next;
}

export async function deleteRecommendation(id: string) {
  const rows = await getRecommendations();
  const next = rows.filter((row) => row.id !== id);
  if (next.length === rows.length) return false;
  await writeRecommendations(next);
  return true;
}

export async function getHoldings(): Promise<HoldingRecord[]> {
  const rows = await readCsv(FILES.holdings);
  return rows.map((row) => ({
    id: stringValue(row.id) || createId("holding"),
    symbol: normalizeSymbol(row.symbol),
    shares: toNumber(row.shares),
    avg_cost: toNumber(row.avg_cost),
    broker: stringValue(row.broker)
  }));
}

export async function createHolding(input: Omit<HoldingRecord, "id">) {
  const rows = await getHoldings();
  const record: HoldingRecord = { id: createId("holding"), ...input, symbol: normalizeSymbol(input.symbol) };
  await writeHoldings([...rows, record]);
  return record;
}

export async function updateHolding(id: string, input: Partial<Omit<HoldingRecord, "id">>) {
  const rows = await getHoldings();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const next = { ...rows[index], ...input, id, symbol: normalizeSymbol(input.symbol || rows[index].symbol) };
  rows[index] = next;
  await writeHoldings(rows);
  return next;
}

export async function deleteHolding(id: string) {
  const rows = await getHoldings();
  const next = rows.filter((row) => row.id !== id);
  if (next.length === rows.length) return false;
  await writeHoldings(next);
  return true;
}

export async function getPriceHistory(symbols?: string[]): Promise<PriceHistoryRecord[]> {
  const filter = symbols ? new Set(symbols.map(normalizeSymbol)) : null;
  const rows = await readCsv(FILES.priceHistory);
  return rows
    .map((row) => ({
      date: stringValue(row.date),
      symbol: normalizeSymbol(row.symbol),
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      close: toNumber(row.close),
      volume: toNumber(row.volume)
    }))
    .filter((row) => row.date && row.symbol && (!filter || filter.has(row.symbol)));
}

async function writeRecommendations(rows: RecommendationRecord[]) {
  await writeCsv(FILES.recommendations, [...HEADERS.recommendations], rows);
}

async function writeHoldings(rows: HoldingRecord[]) {
  await writeCsv(FILES.holdings, [...HEADERS.holdings], rows);
}

async function readCsv(filePath: string) {
  const content = await fs.readFile(filePath, "utf8").catch(() => "");
  const rows = parseCsv(content);
  if (rows.length === 0) return [];
  const headers = rows[0].map((cell) => cell.trim());
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

async function writeCsv<T extends object>(filePath: string, headers: string[], rows: T[]) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = rows.map((row) => {
    const record = row as Record<string, string | number | undefined>;
    return headers.map((header) => csvCell(record[header] ?? "")).join(",");
  });
  await fs.writeFile(filePath, `${headers.join(",")}\n${body.join("\n")}\n`);
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

function csvCell(value: string | number) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSymbol(value: unknown) {
  return stringValue(value).match(/\d{4,6}/)?.[0] || "";
}
