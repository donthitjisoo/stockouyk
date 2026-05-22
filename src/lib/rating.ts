export const ratingOrder = ["S", "TB", "B", "SB", "Watch", "Avoid"] as const;

export type RecommendationRating = (typeof ratingOrder)[number];

export const ratingLabels: Record<RecommendationRating, string> = {
  S: "S",
  TB: "Trend Buy",
  B: "Buy",
  SB: "Strong Buy",
  Watch: "Watch",
  Avoid: "Avoid"
};

export function normalizeRating(value: string | null | undefined): RecommendationRating {
  const text = String(value || "").trim().toLowerCase();
  return ratingOrder.find((rating) => rating.toLowerCase() === text) || "B";
}

export function ratingRank(value: string | null | undefined) {
  return ratingOrder.indexOf(normalizeRating(value));
}
