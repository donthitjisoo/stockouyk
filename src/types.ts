export interface StockRow {
  id: string;
  watchlistId: string;
  watchlistName: string;
  date: string;
  symbol: string;
  name: string;
  market: "TWSE" | "TPEX" | "UNKNOWN";
  marketName: string;
  yahooSymbol: string;
  recommender: string;
  recommendationRating: string;
  ratingRank: number;
  targetPrice: number;
  recommendedPrice: number | null;
  currentPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  sector: string;
  eps: number | null;
  pe: number | null;
  forwardPe: number | null;
  recommendationReturnPct: number;
  remainingUpsidePct: number;
  recommendationGapPct: number;
  distanceToTargetPct: number;
  potentialReturnPct: number;
  instantReturnPct: number;
  recommendationUpsidePct: number;
  elapsedTradingDays: number;
  targetReached: boolean;
  reachedDays: number | null;
  sourceTargetReached: boolean;
  sourceReachedDays: number | null;
  dataStatus: DataStatus;
  priceStatus: DataStatus;
  fundamentalsStatus: DataStatus;
  source: string | null;
  fundamentalsSource: string | null;
  failedProviders: string[];
  updatedAt: string;
}

export type DataStatus = "ok" | "partial_data" | "price_missing" | "fundamentals_missing" | "resolver_failed" | "api_error";

export interface WatchlistData {
  id: string;
  name: string;
  source: string;
  stocks: StockRow[];
}

export interface StocksPayload {
  generatedAt: string;
  watchlists: WatchlistData[];
  stocks: StockRow[];
}

export interface AnalyticsSummary {
  count: number;
  targetReachedCount: number;
  targetRate: number;
  avgReachedDays: number;
  avgPotentialReturn: number;
  avgInstantReturn: number;
  winRate: number;
  unreachedCount: number;
}

export interface AnalyticsPayload {
  generatedAt: string;
  overall: AnalyticsSummary;
  byWatchlist: Record<string, AnalyticsSummary>;
}

export interface LeaderboardPayload {
  generatedAt: string;
  recommenders: Array<{
    recommender: string;
    count: number;
    targetReachedCount: number;
    hitRate: number;
    avgInstantReturn: number;
    avgPotentialReturn: number;
    avgReachedDays: number;
  }>;
}

export interface PortfolioHolding {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
  broker: string;
  account: string;
  name: string;
  market: "TWSE" | "TPEX" | "UNKNOWN";
  marketName: string;
  yahooSymbol: string;
  sector: string;
  currentPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  eps: number | null;
  pe: number | null;
  forwardPe: number | null;
  cost: number;
  marketValue: number;
  todayPnL: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  weight: number;
  dataStatus: DataStatus;
  failedProviders: string[];
  source: string | null;
  updatedAt: string;
}

export interface AllocationItem {
  name: string;
  value: number;
  weight: number;
}

export interface PortfolioAnalytics {
  totalAssets: number;
  todayPnL: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  winRate: number;
  holdingsCount: number;
  cashRatio: number;
  largestHolding: PortfolioHolding | null;
  largestWinner: PortfolioHolding | null;
  largestLoser: PortfolioHolding | null;
  sectorAllocation: AllocationItem[];
  brokerAllocation: AllocationItem[];
  accountAllocation: AllocationItem[];
  pnlRanking: PortfolioHolding[];
}

export interface PortfolioPayload {
  generatedAt: string;
  holdings: PortfolioHolding[];
  analytics: PortfolioAnalytics;
}

export interface RecommendationCsvRecord {
  date: string;
  symbol: string;
  targetPrice: number;
  recommender: string;
  recommendationRating: string;
  targetReached: boolean;
  reachedDays: number | null;
}
