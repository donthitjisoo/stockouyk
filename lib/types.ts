export type TaiwanMarket = "TWSE" | "TPEX" | "UNKNOWN";

export interface TaiwanTicker {
  symbol: string;
  yahooSymbol: string;
  market: TaiwanMarket;
  marketName: "上市" | "上櫃" | "未知";
  name?: string;
}

export interface RecommendationRecord {
  id: string;
  date: string;
  symbol: string;
  target_price: number;
  recommended_price: number;
  recommender: string;
  note: string;
}

export interface HoldingRecord {
  id: string;
  symbol: string;
  shares: number;
  avg_cost: number;
  broker: string;
}

export interface PriceHistoryRecord {
  date: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  yahooSymbol: string;
  name: string;
  market: TaiwanMarket;
  marketName: string;
  currentPrice: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  updatedAt: string;
}

export interface RecommendationView extends RecommendationRecord {
  stockName: string;
  market: TaiwanMarket;
  marketName: string;
  yahooSymbol: string;
  currentPrice: number;
  recommendationReturnPct: number;
  initialPotentialReturnPct: number;
  realtimePotentialReturnPct: number;
  targetReached: boolean;
  reachedDays: number | null;
}

export interface HoldingView extends HoldingRecord {
  stockName: string;
  market: TaiwanMarket;
  marketName: string;
  yahooSymbol: string;
  currentPrice: number;
  cost: number;
  marketValue: number;
  todayPnL: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

export interface DashboardSummary {
  totalAssets: number;
  todayPnL: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  holdingsCount: number;
  recommendationsCount: number;
  reachedRecommendationsCount: number;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  holdings: HoldingView[];
  recommendations: RecommendationView[];
}
