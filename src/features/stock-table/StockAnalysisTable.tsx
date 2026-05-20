import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useVirtualRows } from "../../hooks/useVirtualRows";
import type { StockAnalysisRow } from "../../types/stock";
import { classForSignedValue, formatDate, formatNumber, formatPercent } from "../../utils/formatters";

interface StockAnalysisTableProps {
  rows: StockAnalysisRow[];
  onRemove: (symbol: string) => void;
}

const ROW_HEIGHT = 54;
const VIEWPORT_HEIGHT = 560;

export function StockAnalysisTable({ rows, onRemove }: StockAnalysisTableProps) {
  const [filter, setFilter] = useState("");
  const filteredRows = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter(({ stock, recommendation }) =>
      `${stock.symbol} ${stock.name} ${stock.analyst} ${recommendation.rating}`.toLowerCase().includes(keyword)
    );
  }, [filter, rows]);
  const virtual = useVirtualRows(filteredRows, ROW_HEIGHT, VIEWPORT_HEIGHT);

  return (
    <section className="sheet-section">
      <div className="sheet-head">
        <div>
          <h2>Financial Metrics Engine</h2>
          <p>{filteredRows.length} 檔，所有欄位由 calculateStockMetrics() 產生。</p>
        </div>
        <label className="search">
          搜尋
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="代號、名稱、推薦人" />
        </label>
      </div>

      <div className="table-viewport" style={{ height: VIEWPORT_HEIGHT }} onScroll={(event) => virtual.setScrollTop(event.currentTarget.scrollTop)}>
        <table>
          <thead>
            <tr>
              <th>代號</th>
              <th>名稱</th>
              <th>現價</th>
              <th>目標價</th>
              <th>距離目標</th>
              <th>潛在報酬</th>
              <th>推薦後報酬</th>
              <th>推薦時差</th>
              <th>推薦日期</th>
              <th>交易日</th>
              <th>PE</th>
              <th>Forward PE</th>
              <th>EPS_估</th>
              <th>推薦人</th>
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody style={{ height: virtual.totalHeight }}>
            <tr style={{ height: virtual.offsetTop }} aria-hidden="true" />
            {virtual.rows.map((row) => (
              <tr key={row.stock.symbol} style={{ height: ROW_HEIGHT }}>
                <td className="code-cell">{row.stock.symbol}</td>
                <td>{row.stock.name}</td>
                <td className="numeric">{formatNumber(row.stock.currentPrice)}</td>
                <td className="numeric">{formatNumber(row.stock.targetPrice)}</td>
                <td className={classForSignedValue(row.metrics.distanceToTarget)}>{formatPercent(row.metrics.distanceToTarget)}</td>
                <td className={classForSignedValue(row.metrics.potentialReturn)}>{formatPercent(row.metrics.potentialReturn)}</td>
                <td className={classForSignedValue(row.metrics.recommendationReturn)}>{formatPercent(row.metrics.recommendationReturn)}</td>
                <td className={classForSignedValue(row.metrics.recommendationUpside)}>{formatPercent(row.metrics.recommendationUpside)}</td>
                <td>{formatDate(row.stock.recommendationDate)}</td>
                <td className="numeric">{row.metrics.daysToTarget}</td>
                <td className="numeric">{formatNumber(row.metrics.pe)}</td>
                <td className="numeric">{formatNumber(row.metrics.forwardPe)}</td>
                <td className="numeric">{formatNumber(row.metrics.epsEstimate)}</td>
                <td>{row.stock.analyst}</td>
                <td>
                  <button type="button" className="icon-button danger" onClick={() => onRemove(row.stock.symbol)} aria-label={`移除 ${row.stock.symbol}`}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
