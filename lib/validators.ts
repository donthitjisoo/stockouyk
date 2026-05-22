import { z } from "zod";

export const holdingSchema = z.object({
  symbol: z.string().regex(/\d{4,6}/, "股票代號格式錯誤"),
  shares: z.coerce.number().positive("持有股數必須大於 0"),
  avg_cost: z.coerce.number().positive("平均成本必須大於 0"),
  broker: z.string().default("")
});

export const recommendationSchema = z.object({
  date: z.string().min(8, "推薦日期必填"),
  symbol: z.string().regex(/\d{4,6}/, "股票代號格式錯誤"),
  target_price: z.coerce.number().positive("目標價必須大於 0"),
  recommended_price: z.coerce.number().positive("推薦時股價必須大於 0"),
  recommender: z.string().min(1, "推薦人必填"),
  note: z.string().default("")
});
