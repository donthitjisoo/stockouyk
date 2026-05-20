import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSharedSheet,
  deleteSharedRecommendation,
  isSharedBackendEnabled,
  loadSharedSheets,
  subscribeToSharedSheets,
  upsertSharedRecommendation
} from "../services/sharedSheetsService";
import type { RecommendationInput, StockSheet } from "../types/stock";
import { loadLocalState, saveLocalState, type SheetState } from "./useLocalStockSheets";

export function useStockSheets() {
  const [state, setState] = useState<SheetState>(() => loadLocalState());
  const [backendMode, setBackendMode] = useState(isSharedBackendEnabled ? "shared" : "local");
  const [syncStatus, setSyncStatus] = useState(isSharedBackendEnabled ? "連線共享資料庫中" : "本機模式");

  const activeSheet = useMemo(
    () => state.sheets.find((sheet) => sheet.id === state.activeSheetId) || state.sheets[0],
    [state]
  );

  const applyState = useCallback((nextState: SheetState) => {
    setState(nextState);
    saveLocalState(nextState);
  }, []);

  const loadShared = useCallback(async () => {
    if (!isSharedBackendEnabled) return;
    try {
      const sheets = await loadSharedSheets();
      if (sheets.length === 0) {
        setSyncStatus("共享資料庫尚未建立清單");
        return;
      }
      setBackendMode("shared");
      setSyncStatus("共享同步中");
      setState((current) => ({
        activeSheetId: sheets.some((sheet) => sheet.id === current.activeSheetId) ? current.activeSheetId : sheets[0].id,
        sheets
      }));
    } catch (error) {
      setBackendMode("local");
      setSyncStatus(`共享資料庫不可用，使用本機模式：${(error as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void loadShared();
    return subscribeToSharedSheets(() => {
      void loadShared();
    });
  }, [loadShared]);

  const setActiveSheetId = useCallback(
    (activeSheetId: string) => {
      const nextState = { ...state, activeSheetId };
      setState(nextState);
      saveLocalState(nextState);
    },
    [state]
  );

  const addSheet = useCallback(
    async (name: string) => {
      if (isSharedBackendEnabled) {
        const sheet = await createSharedSheet(name);
        if (sheet) {
          setState((current) => ({ activeSheetId: sheet.id, sheets: [...current.sheets, sheet] }));
          return;
        }
      }
      const sheet = { id: createId(), name, recommendations: [] };
      applyState({ activeSheetId: sheet.id, sheets: [...state.sheets, sheet] });
    },
    [applyState, state.sheets]
  );

  const upsertRecommendation = useCallback(
    async (input: RecommendationInput) => {
      if (isSharedBackendEnabled) await upsertSharedRecommendation(activeSheet.id, input);
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
      applyState({ ...state, sheets: nextSheets });
    },
    [activeSheet.id, applyState, state]
  );

  const removeRecommendation = useCallback(
    async (symbol: string) => {
      if (isSharedBackendEnabled) await deleteSharedRecommendation(activeSheet.id, symbol);
      const nextSheets = state.sheets.map((sheet) =>
        sheet.id === activeSheet.id
          ? { ...sheet, recommendations: sheet.recommendations.filter((item) => item.symbol !== symbol) }
          : sheet
      );
      applyState({ ...state, sheets: nextSheets });
    },
    [activeSheet.id, applyState, state]
  );

  return {
    sheets: state.sheets,
    activeSheet,
    backendMode,
    syncStatus,
    setActiveSheetId,
    addSheet,
    upsertRecommendation,
    removeRecommendation
  };
}

function createId(): string {
  return `sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
