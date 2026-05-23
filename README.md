# 飆股推薦追蹤 Dashboard

這個專案已改成 **Cloudflare Pages + GitHub Actions + 靜態資料架構**。

不使用 Vercel、不使用 database、不使用 websocket、不使用 server、不使用 realtime streaming。  
CSV 是唯一推薦來源，GitHub Actions 每日更新市場資料並輸出靜態 JSON，Cloudflare Pages 只部署 React/Vite 產出的 `dist/`。

## 架構

```txt
GitHub Repo
  ↓
data/**/*.csv
  ↓
GitHub Actions: npm run update:data
  ↓
public/data/*.json
  ↓
Cloudflare Pages: npm run build
  ↓
dist/
```

前端只讀：

- `public/data/stocks.json`
- `public/data/analytics.json`
- `public/data/leaderboard.json`
- `public/data/history.json`
- `public/data/portfolio.json`

## CSV 格式

推薦 CSV 格式固定：

```csv
date,symbol,target_price,recommender,recommendation_rating,target_reached,reached_days
2026-05-22,2330,1180,Tom,TB,false,
2026-05-22,3661,520,Alice,B,true,7
```

`recommendation_rating` 可用值：

```txt
S > TB > B > SB > Watch > Avoid
```

舊 CSV 若沒有 `recommendation_rating` 仍可讀取，系統會預設 `B`。

主推薦來源：

```txt
data/recommendations.csv
```

多 watchlists：

```txt
data/watchlists/AI.csv
data/watchlists/半導體.csv
```

新的股票只能透過修改 CSV 新增。系統不會自動新增推薦股票，也不會同步外部 watchlist。

## 每日更新

`.github/workflows/update-data.yml` 會在台灣時間週一到週五 15:10 自動執行，也可以在 GitHub Actions 手動 Run workflow。

流程：

1. `npm ci`
2. `npm run update:data`
3. 透過 fallback providers 查詢上市/上櫃、Yahoo ticker、股價、EPS、PE、Forward PE
4. 計算推薦衍生欄位與 dashboard analytics
5. 產生 `public/data/*.json`
6. `npm run build`
7. commit 產生後的 JSON 回 repo
8. Cloudflare Pages 因 main branch push 自動部署

## 達標邏輯

如果：

- `current_price >= target_price`
- 且 CSV 原本 `target_reached = false`

則輸出 JSON 時：

- `targetReached = true`
- `reachedDays = 從推薦日至今天的交易日數`

如果 CSV 原本已達標：

- 不覆蓋 `reached_days`
- 保留第一次達標紀錄

## 前端功能

- 深色 / 淺色模式
- 多 watchlists tabs
- Table view
- Search
- Filtering
- Sorting
- CSV Upload，本地預覽用
- Export CSV
- Analytics dashboard
- Leaderboard
- Recommendation rating badge / filter / sorting
- Data status badge：`ok`、`partial_data`、`price_missing`、`fundamentals_missing`、`resolver_failed`、`api_error`
- Portfolio dashboard、treemap、sector/broker/account allocation、損益排行

前端不做大量金融計算。`analytics.json`、`leaderboard.json`、`portfolio.json` 由 GitHub Actions 預先產生，React 只負責 render。

## Fallback providers

資料更新時每檔股票獨立處理，單一股票失敗不會讓整批 build crash。

價格 fallback 順序：

1. Yahoo Finance chart
2. Yahoo scraper
3. TWSE API
4. TPEX API
5. TWSE 公開資料
6. WantGoo

EPS / PE fallback 順序：

1. TWSE OpenAPI
2. TPEX API
3. Yahoo Finance
4. TradingView
5. WantGoo

缺資料時會輸出 dataStatus，不會讓整列空白。

## 本機開發

```bash
npm install
npm run update:data
npm run dev
```

開啟：

```txt
http://127.0.0.1:5173
```

Production build：

```bash
npm run build
npm run preview
```

## Cloudflare Pages 設定

Cloudflare 官方文件列出的 React/Vite 設定是：

- Build command：`npm run build`
- Build output directory：`dist`
- Node.js version：`22`

設定步驟：

1. 到 Cloudflare Dashboard
2. 進入 Workers & Pages
3. Create application
4. Pages
5. Connect to Git
6. 選擇你的 GitHub repo
7. Framework preset 選 `React (Vite)`
8. Build command 填 `npm run build`
9. Build output directory 填 `dist`
10. Environment variables 新增 `NODE_VERSION=22`
11. Production branch 選 `main`
12. Deploy

Cloudflare Pages GitHub integration 會在你 push 到 connected branch 時自動部署。

這個 repo 也放了：

- `.node-version`：讓 Cloudflare / 本機工具優先用 Node 22
- `public/_redirects`：React SPA refresh 不會 404
- `public/_headers`：靜態資源與 JSON cache header
- `wrangler.toml`：只保留 Pages 支援的 `pages_build_output_dir = "dist"`

如果 Cloudflare 後台還是部署失敗，請確認它沒有跑 `npx wrangler deploy`。Cloudflare Pages Git integration 最穩定的設定是：

```bash
npm run build
```

output directory 必須是：

```txt
dist
```

Deploy command 請留空。你第一次貼的錯誤是 Cloudflare 在 build 成功後又執行：

```bash
npx wrangler deploy
```

這是 Workers 的部署指令，不是 Pages 的指令。如果 Cloudflare 後台一定要填 deploy command，請改成：

```bash
npx wrangler pages deploy dist --project-name=stock-dashboard
```

`wrangler.toml` 不要加入 `[assets]`。`wrangler pages deploy` 會驗證 Pages config，而 Pages 專案不支援 `[assets]`。

## 可選：用 GitHub Actions 直傳 Cloudflare Pages

如果你不想用 Cloudflare 後台自動連 Git，也可以用 `.github/workflows/deploy-cloudflare-pages.yml` 手動部署。

需要先到 GitHub repo 設定：

```txt
Settings → Secrets and variables → Actions
```

新增 secrets：

```txt
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

新增 repository variable：

```txt
CLOUDFLARE_PROJECT_NAME
```

之後到 GitHub Actions 手動執行 `Deploy Cloudflare Pages`。

官方參考：

- Cloudflare Pages build configuration: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Cloudflare Pages GitHub integration: https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/
- Cloudflare Pages Git integration guide: https://developers.cloudflare.com/pages/get-started/git-integration/

## GitHub Actions 設定

這個專案不需要 secrets 就能跑。

如果之後要換成正式付費股價 API，可以在 GitHub repo：

```txt
Settings → Secrets and variables → Actions
```

新增：

```bash
MARKET_DATA_API_KEY=
```

目前 `.env.example` 只保留這個 optional 範例。

## 免費部署流程

1. 在 Google Sheets 或 Excel 編輯推薦資料
2. 下載成 CSV
3. 覆蓋 `data/recommendations.csv` 或 `data/watchlists/*.csv`
4. push 到 GitHub main
5. GitHub Actions 更新 `public/data/*.json`
6. Cloudflare Pages 自動部署 `dist/`

## 重要檔案

- `scripts/update-data.mjs`：每日資料更新 pipeline
- `data/recommendations.csv`：主要推薦 CSV
- `data/watchlists/*.csv`：多 watchlists
- `public/data/stocks.json`：前端主要表格資料
- `public/data/analytics.json`：Dashboard 指標
- `public/data/leaderboard.json`：推薦人排行榜
- `public/data/history.json`：歷史價格
- `public/data/portfolio.json`：持倉與 allocation analytics
- `scripts/lib/priceProvider.mjs`：價格 fallback / retry / timeout / cache
- `scripts/lib/fundamentalsProvider.mjs`：EPS、PE、Forward PE fallback
- `src/lib/rating.ts`：前端 rating 順序與標準化
- `src/App.tsx`：靜態 Dashboard UI
