import type { HistoricalPrice, Stock, StockMetrics } from "../types/stock";
import {
  calculateDaysToTarget,
  calculateActualDaysToTarget,
  calculateDistanceToTarget,
  calculateForwardPE,
  calculateMomentumScore,
  calculatePotentialReturn,
  calculateRecommendationReturn,
  calculateRecommendationUpside,
  calculateRiskReward
} from "./calculations";

export function calculateStockMetrics(stock: Stock, history: HistoricalPrice[] = []): StockMetrics {
  const simpleDays = calculateDaysToTarget(stock.currentPrice, stock.targetPrice, history, "simple");
  const volatilityAdjustedDays = calculateDaysToTarget(stock.currentPrice, stock.targetPrice, history, "volatilityAdjusted");
  const actualDaysToTarget = calculateActualDaysToTarget(stock.targetPrice, stock.recommendationDate, history);
  return {
    distanceToTarget: calculateDistanceToTarget(stock.currentPrice, stock.targetPrice),
    potentialReturn: calculatePotentialReturn(stock.currentPrice, stock.targetPrice),
    recommendationReturn: calculateRecommendationReturn(stock.currentPrice, stock.recommendationPrice),
    recommendationUpside: calculateRecommendationUpside(stock.targetPrice, stock.recommendationPrice),
    daysToTarget: actualDaysToTarget ?? volatilityAdjustedDays,
    daysToTargetSimple: simpleDays,
    daysToTargetVolatilityAdjusted: volatilityAdjustedDays,
    pe: stock.pe,
    forwardPe: stock.forwardPe || calculateForwardPE(stock.currentPrice, stock.epsEstimate),
    epsEstimate: stock.epsEstimate,
    riskReward: calculateRiskReward(stock),
    momentumScore: calculateMomentumScore(history)
  };
}
