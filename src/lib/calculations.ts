import type { HistoricalPrice, Stock } from "../types/stock";

const TRADING_DAYS_PER_YEAR = 252;

export function calculateDistanceToTarget(currentPrice: number, targetPrice: number): number {
  return percent((targetPrice - currentPrice) / currentPrice);
}

export function calculatePotentialReturn(currentPrice: number, targetPrice: number): number {
  return calculateDistanceToTarget(currentPrice, targetPrice);
}

export function calculateRecommendationReturn(currentPrice: number, recommendationPrice: number): number {
  return percent((currentPrice - recommendationPrice) / recommendationPrice);
}

export function calculateRecommendationUpside(targetPrice: number, recommendationPrice: number): number {
  return percent((targetPrice - recommendationPrice) / recommendationPrice);
}

export function calculateForwardPE(currentPrice: number, epsEstimate: number): number {
  return safeDivide(currentPrice, epsEstimate);
}

export function calculateRiskReward(stock: Stock): number {
  const upside = Math.max(stock.targetPrice - stock.currentPrice, 0);
  const downsideReference = stock.recommendationPrice || stock.currentPrice;
  const downside = Math.max(stock.currentPrice - downsideReference, stock.currentPrice * 0.05);
  return safeDivide(upside, downside);
}

export function calculateMomentumScore(history: HistoricalPrice[]): number {
  if (history.length < 2) return 0;
  const sorted = sortHistory(history);
  const last = sorted.at(-1)?.close ?? 0;
  const price20 = sorted.at(-21)?.close ?? sorted[0].close;
  const price60 = sorted.at(-61)?.close ?? sorted[0].close;
  const move20 = percent((last - price20) / price20);
  const move60 = percent((last - price60) / price60);
  const volatilityPenalty = calculateDailyVolatility(sorted.slice(-60)) * 100;
  return clamp(move20 * 0.6 + move60 * 0.4 - volatilityPenalty * 0.25, -100, 100);
}

export function calculateDaysToTarget(
  currentPrice: number,
  targetPrice: number,
  history: HistoricalPrice[],
  mode: "simple" | "volatilityAdjusted" = "volatilityAdjusted"
): number {
  if (currentPrice <= 0 || targetPrice <= 0 || targetPrice <= currentPrice) return 0;
  const sorted = sortHistory(history);
  const gap = targetPrice - currentPrice;
  const averageMove20 = calculateAverageDailyMove(sorted.slice(-21));
  const averageMove60 = calculateAverageDailyMove(sorted.slice(-61));
  const baseMove = weightedAverage(
    [
      [averageMove20, 0.65],
      [averageMove60, 0.35]
    ],
    currentPrice * 0.003
  );
  const simpleDays = Math.ceil(gap / Math.max(baseMove, currentPrice * 0.0025));

  if (mode === "simple") return boundDays(simpleDays);

  const volatility = calculateDailyVolatility(sorted.slice(-60));
  const annualizedVolatility = volatility * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const volatilityMultiplier = clamp(1 + annualizedVolatility, 1, 2.8);
  return boundDays(Math.ceil(simpleDays * volatilityMultiplier));
}

export function calculateActualDaysToTarget(targetPrice: number, recommendationDate: string, history: HistoricalPrice[]): number | null {
  if (!recommendationDate || targetPrice <= 0) return null;
  const sorted = sortHistory(history).filter((point) => point.date >= recommendationDate);
  const hitIndex = sorted.findIndex((point) => point.close >= targetPrice || (point.high ?? 0) >= targetPrice);
  return hitIndex >= 0 ? hitIndex + 1 : null;
}

export function calculateAverageDailyMove(history: HistoricalPrice[]): number {
  if (history.length < 2) return 0;
  const moves: number[] = [];
  for (let index = 1; index < history.length; index += 1) {
    moves.push(Math.abs(history[index].close - history[index - 1].close));
  }
  return average(moves);
}

export function calculateDailyVolatility(history: HistoricalPrice[]): number {
  if (history.length < 3) return 0;
  const returns: number[] = [];
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1].close;
    const current = history[index].close;
    if (previous > 0 && current > 0) returns.push((current - previous) / previous);
  }
  return standardDeviation(returns);
}

function percent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value * 100;
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

function sortHistory(history: HistoricalPrice[]): HistoricalPrice[] {
  return [...history].filter((item) => item.close > 0).sort((a, b) => a.date.localeCompare(b.date));
}

function weightedAverage(values: Array<[number, number]>, fallback: number): number {
  const valid = values.filter(([value]) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) return fallback;
  const numerator = valid.reduce((sum, [value, weight]) => sum + value * weight, 0);
  const denominator = valid.reduce((sum, [, weight]) => sum + weight, 0);
  return numerator / denominator;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function boundDays(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 999);
}
