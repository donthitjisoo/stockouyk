import { useCallback, useMemo, useState } from "react";
import type { RecommendationInput, StockSheet } from "../types/stock";

const STORAGE_KEY = "stock-analytics-sheets-v1";
const LEGACY_KEY = "rocket-stock-tracker-v2";

const DEFAULT_SHEETS: StockSheet[] = [
  {
    id: "watch",
    name: "觀察清單",
    recommendations: [
      recommendation("2330", 2400, 2185, "買進", "系統"),
      recommendation("2454", 3500, 3230, "觀察", "系統"),
      recommendation("2317", 280, 240, "觀察", "系統")
    ]
  },
  {
    id: "rocket",
    name: "飆股候選",
    recommendations: [
      recommendation("2327", 600, 520, "買進", "Kevin"),
      recommendation("3163", 1000, 952, "觀察", "Kevin")
    ]
  }
];

export function useLocalStockSheets() {
  const [state, setState] = useState(() => loadState());
  const activeSheet = useMemo(
    () => state.sheets.find((sheet) => sheet.id === state.activeSheetId) || state.sheets[0],
    [state]
  );

  const persist = useCallback((nextState: SheetState) => {
    setState(nextState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }, []);

  const setActiveSheetId = useCallback(
    (activeSheetId: string) => persist({ ...state, activeSheetId }),
    [persist, state]
  );

  const addSheet = useCallback(
    (name: string) => {
      const sheet = { id: createId(), name, recommendations: [] };
      persist({ activeSheetId: sheet.id, sheets: [...state.sheets, sheet] });
    },
    [persist, state]
  );

  const upsertRecommendation = useCallback(
    (input: RecommendationInput) => {
      const nextSheets = state.sheets.map((sheet) => {
        if (sheet.id !== activeSheet.id) return sheet;
        const existing = sheet.recommendations.find((item) => item.symbol === input.symbol);
        return {
          ...sheet,
          recommendations: existing
            ? sheet.recommendations.map((item) => (item.symbol === input.symbol ? { ...item, ...input } : item))
            : [...sheet.recommendations, input]
        };
      });
      persist({ ...state, sheets: nextSheets });
    },
    [activeSheet.id, persist, state]
  );

  const removeRecommendation = useCallback(
    (symbol: string) => {
      const nextSheets = state.sheets.map((sheet) =>
        sheet.id === activeSheet.id
          ? { ...sheet, recommendations: sheet.recommendations.filter((item) => item.symbol !== symbol) }
          : sheet
      );
      persist({ ...state, sheets: nextSheets });
    },
    [activeSheet.id, persist, state]
  );

  return {
    sheets: state.sheets,
    activeSheet,
    setActiveSheetId,
    addSheet,
    upsertRecommendation,
    removeRecommendation
  };
}

export interface SheetState {
  activeSheetId: string;
  sheets: StockSheet[];
}

export function loadLocalState(): SheetState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return normalizeState(JSON.parse(saved));
    } catch {
      return defaultState();
    }
  }

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as { activeListId?: string; lists?: Array<{ id: string; name: string; stocks: LegacyStock[] }> };
      if (Array.isArray(parsed.lists)) {
        const sheets = parsed.lists.map((list) => ({
          id: list.id,
          name: list.name,
          recommendations: list.stocks.map((stock) =>
            recommendation(stock.code, Number(stock.target || 0), Number(stock.target || 0), stock.rating || "觀察", "Legacy", stock.note)
          )
        }));
        return normalizeState({ activeSheetId: parsed.activeListId || sheets[0]?.id, sheets });
      }
    } catch {
      return defaultState();
    }
  }

  return defaultState();
}

export function saveLocalState(nextState: SheetState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function loadState(): SheetState {
  return loadLocalState();
}

function normalizeState(value: Partial<SheetState>): SheetState {
  const sheets = Array.isArray(value.sheets) && value.sheets.length > 0 ? value.sheets : DEFAULT_SHEETS;
  const activeSheetId = value.activeSheetId && sheets.some((sheet) => sheet.id === value.activeSheetId) ? value.activeSheetId : sheets[0].id;
  return { activeSheetId, sheets };
}

function defaultState(): SheetState {
  return { activeSheetId: DEFAULT_SHEETS[0].id, sheets: DEFAULT_SHEETS };
}

function recommendation(
  symbol: string,
  targetPrice: number,
  recommendationPrice: number,
  rating: string,
  analyst: string,
  note = ""
): RecommendationInput {
  return {
    symbol,
    targetPrice,
    recommendationPrice,
    recommendationDate: new Date().toISOString().slice(0, 10),
    analyst,
    rating,
    note
  };
}

function createId(): string {
  return `sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface LegacyStock {
  code: string;
  target?: string;
  rating?: string;
  note?: string;
}
