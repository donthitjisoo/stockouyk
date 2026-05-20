# 飆股分析平台

這是一個適合 GitHub Pages + GitHub Actions 的 FinTech 股票分析平台。行情、fundamentals、history 由 GitHub Actions 產生靜態 JSON；多人共享清單可接 Supabase Realtime 後端。沒有設定 Supabase 時會自動退回 localStorage 本機模式。

## Architecture

```txt
External APIs
  ↓
GitHub Actions
  ↓
scripts/update-data.mjs
  ↓
public/data/*.json
  ↓
React services
  ↓
Supabase shared sheets (optional)
  ↓
metrics engine
  ↓
virtualized analytics table
```

主要目錄：

- `src/types`：Stock domain model 與 analytics types
- `src/lib`：financial calculations、metrics engine、recommendation analytics
- `src/services`：static JSON loading 與 response normalization
- `src/services/sharedSheetsService.ts`：Supabase 共享清單後端
- `src/hooks`：shared/local sheets、stock data、derived rows、virtual rows
- `src/features/stock-table`：股票分析表格 feature
- `data/fundamentals`：fundamentals source layer
- `public/data`：GitHub Actions 產生的靜態資料

## Data Pipeline

```bash
npm run update:data
```

會產生：

- `public/data/stocks.json`
- `public/data/fundamentals.json`
- `public/data/history.json`
- `public/data/recommendation-analytics.json`
- `quotes.json` compatibility cache

GitHub Actions workflow：

- `.github/workflows/update-data.yml`
- 抓 TWSE OpenAPI
- 抓 TPEx OpenAPI
- 對 `watchlist.json` 股票補 MIS/Yahoo live quotes
- 合併 fundamentals
- 產生 static JSON
- build Vite app
- deploy GitHub Pages

## Local Development

```bash
npm install
npm run update:data
npm run dev
```

Production build：

```bash
npm run build
```

## Financial Metrics

`calculateStockMetrics(stock)` 會集中計算：

- distanceToTarget
- potentialReturn
- recommendationReturn
- recommendationUpside
- daysToTarget
- PE
- forward PE
- EPS estimate
- riskReward
- momentumScore

React table 不直接寫公式，只讀 `row.metrics`。

## Shared Backend

要讓所有人新增/修改清單後同步看到，請建立 Supabase project，執行：

```sql
-- Supabase SQL Editor
-- paste supabase-schema.sql
```

然後在 GitHub repository `Settings` → `Secrets and variables` → `Actions` → `Variables` 設定：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

本機開發則建立 `.env`：

```bash
cp .env.example .env
```

注意：目前 schema 是公開讀寫，適合你說的「大家都可以改、所有人同步看到」。若之後要做登入權限，再收緊 RLS policy。
