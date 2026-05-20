import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationInput, StockSheet } from "../types/stock";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSharedBackendEnabled = Boolean(supabaseUrl && supabaseAnonKey);

const supabase: SupabaseClient | null = isSharedBackendEnabled ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

export async function loadSharedSheets(): Promise<StockSheet[]> {
  if (!supabase) return [];

  const [{ data: sheets, error: sheetError }, { data: recommendations, error: recommendationError }] = await Promise.all([
    supabase.from("stock_sheets").select("id,name").order("created_at", { ascending: true }),
    supabase.from("stock_recommendations").select("*").order("created_at", { ascending: true })
  ]);

  if (sheetError) throw sheetError;
  if (recommendationError) throw recommendationError;

  return (sheets || []).map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    recommendations: (recommendations || [])
      .filter((item) => item.sheet_id === sheet.id)
      .map(toRecommendationInput)
  }));
}

export async function createSharedSheet(name: string): Promise<StockSheet | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("stock_sheets").insert({ name }).select("id,name").single();
  if (error) throw error;
  return { id: data.id, name: data.name, recommendations: [] };
}

export async function upsertSharedRecommendation(sheetId: string, input: RecommendationInput): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("stock_recommendations").upsert(
    {
      sheet_id: sheetId,
      symbol: input.symbol,
      target_price: input.targetPrice,
      recommendation_price: input.recommendationPrice,
      recommendation_date: input.recommendationDate,
      analyst: input.analyst,
      rating: input.rating,
      note: input.note || "",
      updated_at: new Date().toISOString()
    },
    { onConflict: "sheet_id,symbol" }
  );
  if (error) throw error;
}

export async function deleteSharedRecommendation(sheetId: string, symbol: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("stock_recommendations").delete().eq("sheet_id", sheetId).eq("symbol", symbol);
  if (error) throw error;
}

export function subscribeToSharedSheets(onChange: () => void): () => void {
  if (!supabase) return () => undefined;
  const channel = supabase
    .channel("shared-stock-sheets")
    .on("postgres_changes", { event: "*", schema: "public", table: "stock_sheets" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "stock_recommendations" }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function toRecommendationInput(row: SharedRecommendationRow): RecommendationInput {
  return {
    id: row.id,
    symbol: row.symbol,
    targetPrice: Number(row.target_price || 0),
    recommendationPrice: Number(row.recommendation_price || 0),
    recommendationDate: row.recommendation_date,
    analyst: row.analyst || "未指定",
    rating: row.rating || "觀察",
    note: row.note || ""
  };
}

interface SharedRecommendationRow {
  id: string;
  sheet_id: string;
  symbol: string;
  target_price: number;
  recommendation_price: number;
  recommendation_date: string;
  analyst: string;
  rating: string;
  note?: string;
}
