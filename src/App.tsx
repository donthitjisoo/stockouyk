import { Download, Moon, RefreshCw, Search, Sun, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseRecommendationCsv, rowsToRecommendationCsv, uploadedRecordsToRows } from "./lib/csv";
import { currency, number, percent } from "./lib/format";
import { ratingOrder } from "./lib/rating";
import type {
  AllocationItem,
  AnalyticsPayload,
  AnalyticsSummary,
  DataStatus,
  LeaderboardPayload,
  PortfolioHolding,
  PortfolioPayload,
  StockRow,
  StocksPayload,
  WatchlistData
} from "./types";

type MainTab = "recommendations" | "portfolio";
type SortKey = "ratingRank" | "potentialReturnPct" | "instantReturnPct" | "distanceToTargetPct" | "reachedDays" | "changePercent";
type PortfolioSortKey = "marketValue" | "todayPnL" | "unrealizedPnL" | "weight" | "changePercent";

interface LocalWatchlist {
  id: string;
  name: string;
  stocks: StockRow[];
}

const rowHeight = 34;
const statusLabels: Record<DataStatus, string> = {
  ok: "OK",
  partial_data: "部分資料",
  price_missing: "缺價格",
  fundamentals_missing: "缺財報",
  resolver_failed: "代號失敗",
  api_error: "API錯誤"
};

export function App() {
  const [stocksPayload, setStocksPayload] = useState<StocksPayload | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("recommendations");
  const [activeWatchlistId, setActiveWatchlistId] = useState("default");
  const [localWatchlists, setLocalWatchlists] = useState<LocalWatchlist[]>(() => loadLocalWatchlists());
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("all");
  const [recommender, setRecommender] = useState("all");
  const [rating, setRating] = useState("all");
  const [targetState, setTargetState] = useState("all");
  const [dataStatus, setDataStatus] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("ratingRank");
  const [portfolioSort, setPortfolioSort] = useState<PortfolioSortKey>("marketValue");
  const [scrollTop, setScrollTop] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [status, setStatus] = useState("載入資料中...");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    loadData().catch((error) => setStatus(error instanceof Error ? error.message : "資料載入失敗"));
  }, []);

  useEffect(() => {
    localStorage.setItem("local-watchlists", JSON.stringify(localWatchlists));
  }, [localWatchlists]);

  async function loadData() {
    setStatus("載入靜態 JSON...");
    const [stocksResult, analyticsResult, leaderboardResult, portfolioResult] = await Promise.all([
      fetchJson<StocksPayload>("/data/stocks.json"),
      fetchJson<AnalyticsPayload>("/data/analytics.json"),
      fetchJson<LeaderboardPayload>("/data/leaderboard.json"),
      fetchJson<PortfolioPayload>("/data/portfolio.json")
    ]);
    setStocksPayload(stocksResult);
    setAnalytics(analyticsResult);
    setLeaderboard(leaderboardResult);
    setPortfolio(portfolioResult);
    setStatus(`更新：${new Date(stocksResult.generatedAt).toLocaleString("zh-TW")}`);
  }

  const allWatchlists = useMemo(() => {
    const remote = stocksPayload?.watchlists ?? [];
    return [...remote, ...localWatchlists] as Array<WatchlistData | LocalWatchlist>;
  }, [stocksPayload, localWatchlists]);

  const activeWatchlist = allWatchlists.find((watchlist) => watchlist.id === activeWatchlistId) || allWatchlists[0];
  const activeRows = activeWatchlist?.stocks ?? [];
  const activeAnalytics = activeWatchlist && analytics?.byWatchlist[activeWatchlist.id]
    ? analytics.byWatchlist[activeWatchlist.id]
    : summarizeRows(activeRows);

  const recommenders = useMemo(() => [...new Set(activeRows.map((row) => row.recommender).filter(Boolean))], [activeRows]);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return activeRows
      .filter((row) => !normalizedQuery || row.symbol.includes(normalizedQuery) || row.name.toLowerCase().includes(normalizedQuery))
      .filter((row) => market === "all" || row.market === market)
      .filter((row) => recommender === "all" || row.recommender === recommender)
      .filter((row) => rating === "all" || row.recommendationRating === rating)
      .filter((row) => targetState === "all" || String(row.targetReached) === targetState)
      .filter((row) => dataStatus === "all" || row.dataStatus === dataStatus)
      .slice()
      .sort((a, b) => compareRows(a, b, sortKey));
  }, [activeRows, dataStatus, market, query, rating, recommender, sortKey, targetState]);

  const portfolioRows = useMemo(() => {
    const rows = portfolio?.holdings ?? [];
    return rows.slice().sort((a, b) => Number(b[portfolioSort] ?? 0) - Number(a[portfolioSort] ?? 0));
  }, [portfolio, portfolioSort]);

  const virtual = useMemo(() => {
    const viewportRows = 18;
    const overscan = 8;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(visibleRows.length, start + viewportRows + overscan * 2);
    return {
      rows: visibleRows.slice(start, end),
      top: start * rowHeight,
      bottom: Math.max(0, (visibleRows.length - end) * rowHeight)
    };
  }, [scrollTop, visibleRows]);

  async function uploadCsv(file: File) {
    const records = parseRecommendationCsv(await file.text());
    const id = `upload-${Date.now().toString(36)}`;
    const name = file.name.replace(/\.csv$/i, "");
    const stocks = uploadedRecordsToRows(records, stocksPayload?.stocks ?? [], id, name);
    setLocalWatchlists((current) => [...current, { id, name, stocks }]);
    setActiveWatchlistId(id);
    setStatus(`已匯入本地 CSV：${name}，共 ${stocks.length} 筆。推上 GitHub 後 Actions 才會正式更新 JSON。`);
  }

  function exportCsv() {
    const csv = rowsToRecommendationCsv(visibleRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeWatchlist?.name || "watchlist"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="terminal-shell">
      <header className="topbar">
        <div>
          <div className="brandline">TW STOCK COMMAND CENTER</div>
          <h1>推薦追蹤 / 持倉管理</h1>
        </div>
        <div className="top-actions">
          <span className="feed-status">{status}</span>
          <button className="tool-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="切換深色淺色">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="tool-button" onClick={loadData}><RefreshCw size={15} />Reload</button>
        </div>
      </header>

      <nav className="main-tabs">
        <button className={mainTab === "recommendations" ? "active" : ""} onClick={() => setMainTab("recommendations")}>Recommendations</button>
        <button className={mainTab === "portfolio" ? "active" : ""} onClick={() => setMainTab("portfolio")}>Portfolio</button>
      </nav>

      {mainTab === "recommendations" ? (
        <>
          <section className="ticker-grid">
            <Metric title="達標率" value={percent(activeAnalytics?.targetRate ?? analytics?.overall.targetRate)} />
            <Metric title="平均達標天數" value={`${number(activeAnalytics?.avgReachedDays ?? analytics?.overall.avgReachedDays, 1)} 日`} />
            <Metric title="平均潛在報酬" value={percent(activeAnalytics?.avgPotentialReturn ?? analytics?.overall.avgPotentialReturn)} tone={activeAnalytics?.avgPotentialReturn} />
            <Metric title="平均即時報酬" value={percent(activeAnalytics?.avgInstantReturn ?? analytics?.overall.avgInstantReturn)} tone={activeAnalytics?.avgInstantReturn} />
            <Metric title="勝率" value={percent(activeAnalytics?.winRate ?? analytics?.overall.winRate)} />
            <Metric title="尚未達標" value={String(activeAnalytics?.unreachedCount ?? analytics?.overall.unreachedCount ?? 0)} />
          </section>

          <section className="terminal-panel">
            <div className="panel-header">
              <div className="watch-tabs">
                {allWatchlists.map((watchlist) => (
                  <button
                    key={watchlist.id}
                    className={watchlist.id === activeWatchlist?.id ? "active" : ""}
                    onClick={() => setActiveWatchlistId(watchlist.id)}
                  >
                    {watchlist.name}<span>{watchlist.stocks.length}</span>
                  </button>
                ))}
              </div>
              <div className="actions">
                <input
                  ref={fileRef}
                  className="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadCsv(file).catch((error) => setStatus(error instanceof Error ? error.message : "CSV 匯入失敗"));
                    event.currentTarget.value = "";
                  }}
                />
                <button className="tool-button" onClick={() => fileRef.current?.click()}><Upload size={14} />CSV</button>
                <button className="tool-button" onClick={exportCsv}><Download size={14} />Export</button>
              </div>
            </div>

            <div className="filter-row">
              <label className="search-box"><Search size={14} /><input placeholder="代號 / 名稱" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <select value={market} onChange={(event) => setMarket(event.target.value)}>
                <option value="all">市場</option><option value="TWSE">上市</option><option value="TPEX">上櫃</option><option value="UNKNOWN">未知</option>
              </select>
              <select value={recommender} onChange={(event) => setRecommender(event.target.value)}>
                <option value="all">推薦人</option>{recommenders.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <select value={rating} onChange={(event) => setRating(event.target.value)}>
                <option value="all">評等</option>{ratingOrder.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={targetState} onChange={(event) => setTargetState(event.target.value)}>
                <option value="all">達標</option><option value="true">已達標</option><option value="false">未達標</option>
              </select>
              <select value={dataStatus} onChange={(event) => setDataStatus(event.target.value)}>
                <option value="all">資料狀態</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="ratingRank">評等排序</option>
                <option value="potentialReturnPct">尚餘空間</option>
                <option value="instantReturnPct">推薦後報酬</option>
                <option value="changePercent">漲跌幅</option>
                <option value="reachedDays">達標天數</option>
              </select>
            </div>

            <div className="market-table-wrap" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
              <table className="market-table">
                <thead>
                  <tr>
                    <th>股票代號</th><th>股票名稱</th><th>市場別</th><th>推薦日期</th><th>推薦人</th><th>評等</th>
                    <th>目標價</th><th>推薦價</th><th>現價</th><th>漲跌</th><th>漲跌幅</th><th>推薦後報酬 %</th>
                    <th>尚餘空間 %</th><th>EPS</th><th>PE</th><th>Forward PE</th><th>是否達標</th><th>幾日達標</th><th>資料狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {virtual.top > 0 && <tr style={{ height: virtual.top }}><td colSpan={19} /></tr>}
                  {virtual.rows.map((row) => <RecommendationRow key={`${row.watchlistId}-${row.id}`} row={row} />)}
                  {virtual.bottom > 0 && <tr style={{ height: virtual.bottom }}><td colSpan={19} /></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="terminal-panel leaderboard-panel">
            <h2>Recommendation Performance</h2>
            <div className="bar-list">
              {(leaderboard?.recommenders ?? []).slice(0, 8).map((item) => (
                <div className="bar-row" key={item.recommender}>
                  <span>{item.recommender}</span>
                  <div><i style={{ width: `${Math.max(4, item.hitRate)}%` }} /></div>
                  <b>{percent(item.hitRate)}</b>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <PortfolioView portfolio={portfolio} rows={portfolioRows} sort={portfolioSort} setSort={setPortfolioSort} />
      )}
    </main>
  );
}

function RecommendationRow({ row }: { row: StockRow }) {
  return (
    <tr>
      <td className="symbol">{row.symbol}</td>
      <td>{row.name}</td>
      <td><span className="micro-badge">{row.marketName}</span></td>
      <td>{row.date}</td>
      <td>{row.recommender}</td>
      <td><span className={`rating rating-${row.recommendationRating.toLowerCase()}`}>{row.recommendationRating}</span></td>
      <td>{currency(row.targetPrice)}</td>
      <td>{currency(row.recommendedPrice)}</td>
      <td className={twTone(row.change)}>{currency(row.currentPrice)}</td>
      <td className={twTone(row.change)}>{signedCurrency(row.change)}</td>
      <td className={twTone(row.changePercent)}>{percent(row.changePercent)}</td>
      <td className={twTone(row.recommendationReturnPct)}>{percent(row.recommendationReturnPct)}</td>
      <td className={twTone(row.remainingUpsidePct)}>{percent(row.remainingUpsidePct)}</td>
      <td>{number(row.eps)}</td>
      <td>{number(row.pe)}</td>
      <td>{number(row.forwardPe)}</td>
      <td><span className={`status-pill ${row.targetReached ? "ok" : "wait"}`}>{row.targetReached ? "Y" : "N"}</span></td>
      <td>{row.reachedDays ?? "-"}</td>
      <td><DataStatusBadge row={row} /></td>
    </tr>
  );
}

function PortfolioView({ portfolio, rows, sort, setSort }: { portfolio: PortfolioPayload | null; rows: PortfolioHolding[]; sort: PortfolioSortKey; setSort: (key: PortfolioSortKey) => void }) {
  const analytics = portfolio?.analytics;
  return (
    <>
      <section className="ticker-grid portfolio-metrics">
        <Metric title="總資產" value={currency(analytics?.totalAssets)} />
        <Metric title="今日損益" value={signedCurrency(analytics?.todayPnL)} tone={analytics?.todayPnL} />
        <Metric title="未實現損益" value={signedCurrency(analytics?.unrealizedPnL)} tone={analytics?.unrealizedPnL} />
        <Metric title="勝率" value={percent(analytics?.winRate)} />
        <Metric title="持倉數" value={String(analytics?.holdingsCount ?? 0)} />
        <Metric title="現金比例" value={percent(analytics?.cashRatio)} />
        <Metric title="最大持倉" value={analytics?.largestHolding?.symbol ?? "-"} />
        <Metric title="最大獲利" value={analytics?.largestWinner ? `${analytics.largestWinner.symbol} ${signedCurrency(analytics.largestWinner.unrealizedPnL)}` : "-"} tone={analytics?.largestWinner?.unrealizedPnL} />
        <Metric title="最大虧損" value={analytics?.largestLoser ? `${analytics.largestLoser.symbol} ${signedCurrency(analytics.largestLoser.unrealizedPnL)}` : "-"} tone={analytics?.largestLoser?.unrealizedPnL} />
      </section>

      <section className="portfolio-grid">
        <div className="terminal-panel treemap-panel">
          <h2>持倉比例 Treemap</h2>
          <Treemap rows={rows} />
        </div>
        <div className="terminal-panel">
          <h2>Allocation</h2>
          <div className="chart-grid">
            <Donut title="Sector" items={analytics?.sectorAllocation ?? []} />
            <Donut title="Broker" items={analytics?.brokerAllocation ?? []} />
            <Donut title="Account" items={analytics?.accountAllocation ?? []} />
          </div>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <h2>持倉明細</h2>
          <select value={sort} onChange={(event) => setSort(event.target.value as PortfolioSortKey)}>
            <option value="marketValue">依市值</option>
            <option value="todayPnL">依今日損益</option>
            <option value="unrealizedPnL">依未實現損益</option>
            <option value="weight">依持倉比例</option>
            <option value="changePercent">依漲跌幅</option>
          </select>
        </div>
        <div className="market-table-wrap portfolio-table">
          <table className="market-table">
            <thead>
              <tr><th>代號</th><th>名稱</th><th>券商</th><th>股數</th><th>成本</th><th>現價</th><th>市值</th><th>比例</th><th>漲跌幅</th><th>今日損益</th><th>未實現損益</th><th>資料</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="symbol">{row.symbol}</td><td>{row.name}</td><td>{row.broker}</td><td>{number(row.shares, 0)}</td>
                  <td>{currency(row.cost)}</td><td className={twTone(row.change)}>{currency(row.currentPrice)}</td><td>{currency(row.marketValue)}</td>
                  <td>{percent(row.weight)}</td><td className={twTone(row.changePercent)}>{percent(row.changePercent)}</td>
                  <td className={twTone(row.todayPnL)}>{signedCurrency(row.todayPnL)}</td><td className={twTone(row.unrealizedPnL)}>{signedCurrency(row.unrealizedPnL)}</td>
                  <td><StatusBadge status={row.dataStatus} failures={row.failedProviders} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Treemap({ rows }: { rows: PortfolioHolding[] }) {
  const topRows = rows.filter((row) => row.marketValue > 0).slice(0, 40);
  return (
    <div className="treemap">
      {topRows.map((row) => (
        <div
          key={row.id}
          className={`treemap-cell ${twTone(row.changePercent)}`}
          style={{ flexBasis: `${Math.max(8, row.weight)}%` }}
          title={`${row.name}\n市值 ${currency(row.marketValue)}\n損益 ${signedCurrency(row.unrealizedPnL)}\n比例 ${percent(row.weight)}`}
        >
          <strong>{row.symbol}</strong>
          <span>{percent(row.changePercent)}</span>
          <em>{percent(row.weight)}</em>
        </div>
      ))}
    </div>
  );
}

function Donut({ title, items }: { title: string; items: AllocationItem[] }) {
  const colors = ["#d64b4b", "#14a06f", "#d7a82f", "#4f8cff", "#c16cff", "#8a98a8", "#e1762d"];
  let cursor = 0;
  const gradient = items.length
    ? items.map((item, index) => {
      const start = cursor;
      cursor += item.weight;
      return `${colors[index % colors.length]} ${start}% ${cursor}%`;
    }).join(", ")
    : "#303844 0 100%";
  return (
    <div className="donut-card">
      <div className="donut" style={{ background: `conic-gradient(${gradient})` }} />
      <h3>{title}</h3>
      {items.slice(0, 5).map((item) => <p key={item.name}><span>{item.name}</span><b>{percent(item.weight)}</b></p>)}
    </div>
  );
}

function DataStatusBadge({ row }: { row: StockRow }) {
  return <StatusBadge status={row.dataStatus} failures={row.failedProviders} />;
}

function StatusBadge({ status, failures }: { status: DataStatus; failures: string[] }) {
  return <span className={`data-status ${status}`} title={failures.length ? failures.join("\n") : statusLabels[status]}>{statusLabels[status]}</span>;
}

function Metric({ title, value, tone }: { title: string; value: string; tone?: number | null }) {
  return (
    <div className="quote-tile">
      <span>{title}</span>
      <strong className={twTone(tone)}>{value}</strong>
    </div>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${url}?v=${Date.now()}`);
  if (!response.ok) throw new Error(`${url} 載入失敗`);
  return response.json();
}

function compareRows(a: StockRow, b: StockRow, key: SortKey) {
  if (key === "ratingRank") return a.ratingRank - b.ratingRank || b.potentialReturnPct - a.potentialReturnPct;
  return Number(b[key] ?? -Infinity) - Number(a[key] ?? -Infinity);
}

function summarizeRows(rows: StockRow[]): AnalyticsSummary {
  const reached = rows.filter((row) => row.targetReached);
  return {
    count: rows.length,
    targetReachedCount: reached.length,
    targetRate: pct(reached.length, rows.length),
    avgReachedDays: avg(reached.map((row) => row.reachedDays).filter((value) => value !== null) as number[]),
    avgPotentialReturn: avg(rows.map((row) => row.potentialReturnPct)),
    avgInstantReturn: avg(rows.map((row) => row.instantReturnPct)),
    winRate: pct(rows.filter((row) => row.instantReturnPct > 0).length, rows.length),
    unreachedCount: rows.length - reached.length
  };
}

function loadLocalWatchlists(): LocalWatchlist[] {
  try {
    return JSON.parse(localStorage.getItem("local-watchlists") || "[]");
  } catch {
    return [];
  }
}

function pct(numerator: number, denominator: number) {
  return denominator ? (numerator / denominator) * 100 : 0;
}

function avg(values: number[]) {
  const numbers = values.filter((value) => Number.isFinite(value));
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
}

function twTone(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "missing";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function signedCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${currency(value)}`;
}
