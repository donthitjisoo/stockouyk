import "server-only";

import { calculateHoldingView, calculateRecommendationView } from "./calculations";
import {
  createHolding,
  createRecommendation,
  deleteHolding,
  deleteRecommendation,
  getHoldings,
  getPriceHistory,
  getRecommendations,
  updateHolding,
  updateRecommendation
} from "./csvStore";
import { getHistoricalPrices, getQuotes } from "./priceProvider";
import type { DashboardResponse, HoldingRecord, HoldingView, PriceHistoryRecord, RecommendationRecord, RecommendationView } from "./types";

export async function listRecommendationViews(): Promise<RecommendationView[]> {
  const recommendations = await getRecommendations();
  const symbols = recommendations.map((row) => row.symbol);
  const [quotes, csvHistory] = await Promise.all([getQuotes(symbols), getPriceHistory(symbols)]);
  const history = await loadRecommendationHistory(recommendations, csvHistory);

  return recommendations.map((recommendation) =>
    calculateRecommendationView(recommendation, quotes[recommendation.symbol] || fallbackQuote(recommendation.symbol), history)
  );
}

export async function listHoldingViews(): Promise<HoldingView[]> {
  const holdings = await getHoldings();
  const quotes = await getQuotes(holdings.map((row) => row.symbol));
  return holdings.map((holding) => calculateHoldingView(holding, quotes[holding.symbol] || fallbackQuote(holding.symbol)));
}

export async function getDashboard(): Promise<DashboardResponse> {
  const [holdings, recommendations] = await Promise.all([listHoldingViews(), listRecommendationViews()]);
  const totalAssets = holdings.reduce((sum, row) => sum + row.marketValue, 0);
  const cost = holdings.reduce((sum, row) => sum + row.cost, 0);
  const unrealizedPnL = holdings.reduce((sum, row) => sum + row.unrealizedPnL, 0);
  const todayPnL = holdings.reduce((sum, row) => sum + row.todayPnL, 0);

  return {
    summary: {
      totalAssets,
      todayPnL: Number.isFinite(todayPnL) ? todayPnL : 0,
      unrealizedPnL,
      unrealizedPnLPct: cost ? (unrealizedPnL / cost) * 100 : 0,
      holdingsCount: holdings.length,
      recommendationsCount: recommendations.length,
      reachedRecommendationsCount: recommendations.filter((row) => row.targetReached).length
    },
    holdings,
    recommendations
  };
}

export const holdingMutations = {
  create: createHolding,
  update: updateHolding,
  delete: deleteHolding
};

export const recommendationMutations = {
  create: createRecommendation,
  update: updateRecommendation,
  delete: deleteRecommendation
};

async function loadRecommendationHistory(recommendations: RecommendationRecord[], csvHistory: PriceHistoryRecord[]) {
  const bySymbol = new Map<string, PriceHistoryRecord[]>();
  for (const row of csvHistory) {
    bySymbol.set(row.symbol, [...(bySymbol.get(row.symbol) || []), row]);
  }

  const missing = recommendations.filter((row) => !bySymbol.has(row.symbol));
  const fetched = await Promise.all(missing.map((row) => getHistoricalPrices(row.symbol, row.date)));
  return [...csvHistory, ...fetched.flat()];
}

function fallbackQuote(symbol: string) {
  return {
    symbol,
    yahooSymbol: `${symbol}.TW`,
    name: symbol,
    market: "UNKNOWN" as const,
    marketName: "未知",
    currentPrice: 0,
    updatedAt: new Date().toISOString()
  };
}

export type { HoldingRecord, RecommendationRecord };
