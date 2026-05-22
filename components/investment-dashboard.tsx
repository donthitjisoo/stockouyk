"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, Edit, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatNumber, formatSignedCurrency, formatSignedPercent } from "@/lib/formatters";
import type { DashboardResponse, HoldingView, RecommendationView } from "@/lib/types";

type Tab = "holdings" | "recommendations";
type HoldingSort = "marketValue" | "unrealizedPnL";
type RecommendationSort = "realtimePotentialReturnPct" | "recommendationReturnPct";

const emptyHolding = { symbol: "", shares: 0, avg_cost: 0, broker: "" };
const emptyRecommendation = {
  date: new Date().toISOString().slice(0, 10),
  symbol: "",
  target_price: 0,
  recommended_price: 0,
  recommender: "",
  note: ""
};

export function InvestmentDashboard({ initialData }: { initialData: DashboardResponse }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("holdings");
  const [query, setQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState("all");
  const [recommenderFilter, setRecommenderFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [holdingSort, setHoldingSort] = useState<HoldingSort>("marketValue");
  const [recommendationSort, setRecommendationSort] = useState<RecommendationSort>("realtimePotentialReturnPct");
  const [holdingDraft, setHoldingDraft] = useState(emptyHolding);
  const [recommendationDraft, setRecommendationDraft] = useState(emptyRecommendation);
  const [editingHolding, setEditingHolding] = useState<HoldingView | null>(null);
  const [editingRecommendation, setEditingRecommendation] = useState<RecommendationView | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const recommenders = useMemo(
    () => [...new Set(data.recommendations.map((row) => row.recommender).filter(Boolean))],
    [data.recommendations]
  );

  const holdings = useMemo(() => {
    return data.holdings
      .filter((row) => matchesQuery(row.symbol, row.stockName, query))
      .filter((row) => marketFilter === "all" || row.market === marketFilter)
      .sort((a, b) => b[holdingSort] - a[holdingSort]);
  }, [data.holdings, holdingSort, marketFilter, query]);

  const recommendations = useMemo(() => {
    return data.recommendations
      .filter((row) => matchesQuery(row.symbol, row.stockName, query))
      .filter((row) => marketFilter === "all" || row.market === marketFilter)
      .filter((row) => recommenderFilter === "all" || row.recommender === recommenderFilter)
      .filter((row) => targetFilter === "all" || String(row.targetReached) === targetFilter)
      .sort((a, b) => b[recommendationSort] - a[recommendationSort]);
  }, [data.recommendations, marketFilter, query, recommendationSort, recommenderFilter, targetFilter]);

  async function refresh() {
    setLoading(true);
    setStatus("更新資料中...");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      setData(await response.json());
      setStatus("資料已更新");
    } catch {
      setStatus("資料更新失敗");
    } finally {
      setLoading(false);
    }
  }

  async function saveHolding() {
    const editing = Boolean(editingHolding);
    await mutate(editing ? `/api/holdings/${editingHolding?.id}` : "/api/holdings", editing ? "PUT" : "POST", holdingDraft);
    setEditingHolding(null);
    setHoldingDraft(emptyHolding);
  }

  async function saveRecommendation() {
    const editing = Boolean(editingRecommendation);
    await mutate(
      editing ? `/api/recommendations/${editingRecommendation?.id}` : "/api/recommendations",
      editing ? "PUT" : "POST",
      recommendationDraft
    );
    setEditingRecommendation(null);
    setRecommendationDraft(emptyRecommendation);
  }

  async function mutate(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown) {
    setLoading(true);
    setStatus("寫入 CSV 中...");
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatus(payload.error || "操作失敗");
      setLoading(false);
      return;
    }
    await refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-5 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Personal Investment Manager</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-foreground">個人投資管理 Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            GitHub CSV 保存原始推薦與持倉，Next.js API 自動補股價、市場別與績效計算。
          </p>
        </div>
        <Button onClick={refresh} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          重新整理
        </Button>
      </header>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        <Metric title="總資產" value={formatCurrency(data.summary.totalAssets)} />
        <Metric title="今日損益" value={formatSignedCurrency(data.summary.todayPnL)} tone={data.summary.todayPnL >= 0 ? "good" : "bad"} />
        <Metric title="未實現損益" value={formatSignedCurrency(data.summary.unrealizedPnL)} tone={data.summary.unrealizedPnL >= 0 ? "good" : "bad"} />
        <Metric title="未實現損益率" value={formatSignedPercent(data.summary.unrealizedPnLPct)} tone={data.summary.unrealizedPnL >= 0 ? "good" : "bad"} />
        <Metric title="持倉數量" value={formatNumber(data.summary.holdingsCount)} />
        <Metric title="推薦股票" value={formatNumber(data.summary.recommendationsCount)} />
        <Metric title="已達標推薦" value={formatNumber(data.summary.reachedRecommendationsCount)} />
      </section>

      <Card>
        <CardHeader className="flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant={tab === "holdings" ? "default" : "secondary"} onClick={() => setTab("holdings")}>
              持倉管理
            </Button>
            <Button variant={tab === "recommendations" ? "default" : "secondary"} onClick={() => setTab("recommendations")}>
              推薦追蹤
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="搜尋股票代號或名稱" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <select className="h-9 rounded-md border bg-input px-3 text-sm" value={marketFilter} onChange={(event) => setMarketFilter(event.target.value)}>
              <option value="all">全部市場</option>
              <option value="TWSE">上市</option>
              <option value="TPEX">上櫃</option>
              <option value="UNKNOWN">未知</option>
            </select>
            {tab === "recommendations" && (
              <>
                <select className="h-9 rounded-md border bg-input px-3 text-sm" value={recommenderFilter} onChange={(event) => setRecommenderFilter(event.target.value)}>
                  <option value="all">全部推薦人</option>
                  {recommenders.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <select className="h-9 rounded-md border bg-input px-3 text-sm" value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}>
                  <option value="all">全部達標狀態</option>
                  <option value="true">已達標</option>
                  <option value="false">未達標</option>
                </select>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {status && <div className="mb-3 rounded-md border bg-input px-3 py-2 text-sm text-muted-foreground">{status}</div>}
          {tab === "holdings" ? (
            <HoldingsTable
              rows={holdings}
              sort={holdingSort}
              onSort={setHoldingSort}
              onAdd={() => setEditingHolding({ id: "", ...emptyHolding } as HoldingView)}
              onEdit={(row) => {
                setEditingHolding(row);
                setHoldingDraft(row);
              }}
              onDelete={(row) => mutate(`/api/holdings/${row.id}`, "DELETE")}
            />
          ) : (
            <RecommendationsTable
              rows={recommendations}
              sort={recommendationSort}
              onSort={setRecommendationSort}
              onAdd={() => setEditingRecommendation({ id: "", ...emptyRecommendation } as RecommendationView)}
              onEdit={(row) => {
                setEditingRecommendation(row);
                setRecommendationDraft(row);
              }}
              onDelete={(row) => mutate(`/api/recommendations/${row.id}`, "DELETE")}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingHolding)} onOpenChange={(open) => !open && setEditingHolding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingHolding?.id ? "編輯持倉" : "新增持倉"}</DialogTitle>
          </DialogHeader>
          <HoldingForm value={holdingDraft} onChange={setHoldingDraft} onSubmit={saveHolding} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingRecommendation)} onOpenChange={(open) => !open && setEditingRecommendation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRecommendation?.id ? "編輯推薦" : "新增推薦"}</DialogTitle>
          </DialogHeader>
          <RecommendationForm value={recommendationDraft} onChange={setRecommendationDraft} onSubmit={saveRecommendation} />
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <p className={`mt-2 text-xl font-bold ${tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function HoldingsTable({
  rows,
  sort,
  onSort,
  onAdd,
  onEdit,
  onDelete
}: {
  rows: HoldingView[];
  sort: HoldingSort;
  onSort: (sort: HoldingSort) => void;
  onAdd: () => void;
  onEdit: (row: HoldingView) => void;
  onDelete: (row: HoldingView) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <CardTitle>持倉</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onSort(sort === "marketValue" ? "unrealizedPnL" : "marketValue")}>
            <ArrowDownUp className="h-4 w-4" />
            {sort === "marketValue" ? "依市值排序" : "依未實現損益排序"}
          </Button>
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4" />
            新增持倉
          </Button>
        </div>
      </div>
      <div className="overflow-auto rounded-md border">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>{["股票代號", "股票名字", "市場別", "持有股數", "平均成本", "現行股價", "成本", "市值", "未實現損益", "未實現損益率", "券商", ""].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <Td>{row.symbol}</Td>
                <Td>{row.stockName}</Td>
                <Td><Badge>{row.marketName}</Badge></Td>
                <Td>{formatNumber(row.shares)}</Td>
                <Td>{formatCurrency(row.avg_cost)}</Td>
                <Td>{formatCurrency(row.currentPrice)}</Td>
                <Td>{formatCurrency(row.cost)}</Td>
                <Td>{formatCurrency(row.marketValue)}</Td>
                <Td tone={row.unrealizedPnL >= 0 ? "good" : "bad"}>{formatSignedCurrency(row.unrealizedPnL)}</Td>
                <Td tone={row.unrealizedPnL >= 0 ? "good" : "bad"}>{formatSignedPercent(row.unrealizedPnLPct)}</Td>
                <Td>{row.broker}</Td>
                <Td>
                  <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecommendationsTable({
  rows,
  sort,
  onSort,
  onAdd,
  onEdit,
  onDelete
}: {
  rows: RecommendationView[];
  sort: RecommendationSort;
  onSort: (sort: RecommendationSort) => void;
  onAdd: () => void;
  onEdit: (row: RecommendationView) => void;
  onDelete: (row: RecommendationView) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <CardTitle>推薦表</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onSort(sort === "realtimePotentialReturnPct" ? "recommendationReturnPct" : "realtimePotentialReturnPct")}>
            <ArrowDownUp className="h-4 w-4" />
            {sort === "realtimePotentialReturnPct" ? "依潛在報酬排序" : "依推薦時差排序"}
          </Button>
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4" />
            新增推薦
          </Button>
        </div>
      </div>
      <div className="overflow-auto rounded-md border">
        <table className="w-full min-w-[1320px] text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>{["股票代號", "股票名字", "市場別", "推薦日期", "推薦人", "目標價", "推薦時股價", "現行股價", "與推薦時差 %", "當下潛在報酬", "實時潛在報酬", "是否達標", "達標交易日", "備註", ""].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <Td>{row.symbol}</Td>
                <Td>{row.stockName}</Td>
                <Td><Badge>{row.marketName}</Badge></Td>
                <Td>{row.date}</Td>
                <Td>{row.recommender}</Td>
                <Td>{formatCurrency(row.target_price)}</Td>
                <Td>{formatCurrency(row.recommended_price)}</Td>
                <Td>{formatCurrency(row.currentPrice)}</Td>
                <Td tone={row.recommendationReturnPct >= 0 ? "good" : "bad"}>{formatSignedPercent(row.recommendationReturnPct)}</Td>
                <Td>{formatSignedPercent(row.initialPotentialReturnPct)}</Td>
                <Td tone={row.realtimePotentialReturnPct >= 0 ? "good" : "bad"}>{formatSignedPercent(row.realtimePotentialReturnPct)}</Td>
                <Td><Badge className={row.targetReached ? "border-success text-success" : "border-danger text-danger"}>{row.targetReached ? "已達標" : "未達標"}</Badge></Td>
                <Td>{row.reachedDays ?? "-"}</Td>
                <Td>{row.note}</Td>
                <Td>
                  <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HoldingForm({ value, onChange, onSubmit }: { value: typeof emptyHolding; onChange: (value: typeof emptyHolding) => void; onSubmit: () => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="股票代號"><Input value={value.symbol} onChange={(event) => onChange({ ...value, symbol: event.target.value })} /></Field>
      <Field label="持有股數"><Input type="number" value={value.shares} onChange={(event) => onChange({ ...value, shares: Number(event.target.value) })} /></Field>
      <Field label="平均成本"><Input type="number" value={value.avg_cost} onChange={(event) => onChange({ ...value, avg_cost: Number(event.target.value) })} /></Field>
      <Field label="券商"><Input value={value.broker} onChange={(event) => onChange({ ...value, broker: event.target.value })} /></Field>
      <div className="md:col-span-2"><Button className="w-full" onClick={onSubmit}>儲存持倉</Button></div>
    </div>
  );
}

function RecommendationForm({ value, onChange, onSubmit }: { value: typeof emptyRecommendation; onChange: (value: typeof emptyRecommendation) => void; onSubmit: () => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="推薦日期"><Input type="date" value={value.date} onChange={(event) => onChange({ ...value, date: event.target.value })} /></Field>
      <Field label="股票代號"><Input value={value.symbol} onChange={(event) => onChange({ ...value, symbol: event.target.value })} /></Field>
      <Field label="目標價"><Input type="number" value={value.target_price} onChange={(event) => onChange({ ...value, target_price: Number(event.target.value) })} /></Field>
      <Field label="推薦時股價"><Input type="number" value={value.recommended_price} onChange={(event) => onChange({ ...value, recommended_price: Number(event.target.value) })} /></Field>
      <Field label="推薦人"><Input value={value.recommender} onChange={(event) => onChange({ ...value, recommender: event.target.value })} /></Field>
      <Field label="備註"><Input value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} /></Field>
      <div className="md:col-span-2"><Button className="w-full" onClick={onSubmit}>儲存推薦</Button></div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={onEdit}><Edit className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

function Td({ children, tone }: { children: React.ReactNode; tone?: "good" | "bad" }) {
  return <td className={`whitespace-nowrap px-3 py-2 ${tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : ""}`}>{children}</td>;
}

function matchesQuery(symbol: string, name: string, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return symbol.toLowerCase().includes(normalized) || name.toLowerCase().includes(normalized);
}
