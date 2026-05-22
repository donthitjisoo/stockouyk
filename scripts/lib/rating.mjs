export const ratingOrder = ["S", "TB", "B", "SB", "Watch", "Avoid"];

export const ratingLabels = {
  S: "S",
  TB: "Trend Buy",
  B: "Buy",
  SB: "Strong Buy",
  Watch: "Watch",
  Avoid: "Avoid"
};

export function normalizeRating(value) {
  const text = String(value || "").trim();
  const matched = ratingOrder.find((rating) => rating.toLowerCase() === text.toLowerCase());
  return matched || "B";
}

export function isRating(value) {
  const text = String(value || "").trim().toLowerCase();
  return ratingOrder.some((rating) => rating.toLowerCase() === text);
}

export function ratingRank(value) {
  const rating = normalizeRating(value);
  const index = ratingOrder.indexOf(rating);
  return index === -1 ? ratingOrder.indexOf("B") : index;
}
