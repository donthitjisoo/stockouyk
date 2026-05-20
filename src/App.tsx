import { AppHeader } from "./components/AppHeader";
import { StockAnalysisTable } from "./features/stock-table/StockAnalysisTable";
import { StockToolbar } from "./features/stock-table/StockToolbar";
import { useQuoteIndex, useStockData } from "./hooks/useStockData";
import { useStockAnalysis } from "./hooks/useStockAnalysis";
import { useStockSheets } from "./hooks/useStockSheets";

export function App() {
  const { data, isLoading, error, reload } = useStockData();
  const quoteIndex = useQuoteIndex(data);
  const { sheets, activeSheet, backendMode, syncStatus, addSheet, setActiveSheetId, upsertRecommendation, removeRecommendation } = useStockSheets();
  const rows = useStockAnalysis(activeSheet, data);

  return (
    <>
      <AppHeader updatedAt={data?.market.updatedAt} source={data?.market.source} onReload={reload} />
      <main>
        <StockToolbar
          sheets={sheets}
          activeSheet={activeSheet}
          quotes={[...quoteIndex.values()]}
          onAddSheet={addSheet}
          onSelectSheet={setActiveSheetId}
          onUpsertRecommendation={upsertRecommendation}
        />

        <section className="stats" aria-label="平台摘要">
          <div>
            <span className="stat-label">分析檔數</span>
            <strong>{rows.length}</strong>
          </div>
          <div>
            <span className="stat-label">靜態資料庫</span>
            <strong>{data?.market.quotes.length || 0}</strong>
          </div>
          <div>
            <span className="stat-label">狀態</span>
            <strong>{isLoading ? "載入中" : error || `${backendMode === "shared" ? "共享" : "本機"} · ${syncStatus}`}</strong>
          </div>
        </section>

        <StockAnalysisTable rows={rows} onRemove={removeRecommendation} />
      </main>
    </>
  );
}
