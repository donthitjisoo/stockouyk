# 個人投資管理 Web App

Next.js 15 + TypeScript 投資管理 dashboard。資料來源改成 GitHub repo 內的 CSV 檔，後端 API Routes 負責讀取 CSV、查詢台股報價、辨識上市/上櫃、計算持倉與推薦績效。

你可以維持原本工作流：在 Google Sheets 手動整理資料，下載 CSV，覆蓋 repo 內的 CSV 後 push 到 GitHub。App 不需要連 Google Sheets API。

> 這個版本有 Next.js API Routes，所以仍建議部署到 Vercel、Render、Fly.io，或任何可執行 Next.js server 的 Node.js 平台。GitHub Pages 只能放靜態頁，不能跑 API Routes。

## CSV 資料檔

### `data/recommendations.csv`

推薦股票資料。

```csv
id,date,symbol,target_price,recommended_price,recommender,note
rec_001,2026-05-22,2330,1180,950,Tom,AI server supply chain
rec_002,2026-05-22,3661,520,410,Alice,TPEX semiconductor
```

### `data/portfolio.csv`

個人持倉資料。格式固定，不再使用 `account`。

```csv
id,symbol,shares,avg_cost,broker
holding_001,2330,1000,850,富邦
holding_002,3661,200,390,永豐
```

### `data/price_history.csv`

歷史價格資料，用來判斷推薦是否達標與幾個交易日達標。若 CSV 沒有足夠歷史資料，後端會嘗試從 Yahoo Finance chart endpoint 補日線。

```csv
date,symbol,open,high,low,close,volume
2026-05-22,2330,950,990,945,980,45000000
2026-05-22,3661,410,450,405,440,3500000
```

## 功能

- Dashboard：總資產、今日損益、未實現損益、持倉數量、推薦數量、已達標推薦
- 從 GitHub CSV 讀取持倉與推薦資料
- API Routes 保留 CRUD 介面，方便之後替換成正式後端
- 自動補齊股票名稱、現行股價、上市/上櫃、Yahoo ticker
- 自動計算推薦時差、當下潛在報酬、實時潛在報酬、是否達標、達標交易日
- 搜尋股票代號/名稱
- 推薦人、市場別、達標狀態篩選
- 依市值、未實現損益、潛在報酬排序

## 執行

```bash
npm install
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。

## API

- `GET /api/dashboard`
- `GET /api/holdings`
- `POST /api/holdings`
- `PUT /api/holdings/:id`
- `DELETE /api/holdings/:id`
- `GET /api/recommendations`
- `POST /api/recommendations`
- `PUT /api/recommendations/:id`
- `DELETE /api/recommendations/:id`
- `GET /api/prices?symbols=2330,3661`

目前 CRUD 會寫入本機 `data/*.csv`。部署到 Vercel 這類 serverless 平台時，檔案系統不適合當永久資料庫，所以正式資料更新建議仍用「下載 CSV → push GitHub → redeploy」流程。之後若要接正式後端，只要替換 `lib/csvStore.ts`。

## 台股上市 / 上櫃辨識

`lib/twStockResolver.ts` 會優先用快取和內建常用股 fallback，再嘗試 TWSE/TPEX OpenAPI：

- 上市：`2330` → `2330.TW`
- 上櫃：`3661` → `3661.TWO`

解析結果格式：

```ts
{
  symbol: "3661",
  yahooSymbol: "3661.TWO",
  market: "TPEX",
  marketName: "上櫃"
}
```

## 模組

- `lib/csvStore.ts`：CSV 讀寫資料層
- `lib/priceProvider.ts`：報價 provider、cache、Yahoo Finance chart adapter
- `lib/twStockResolver.ts`：上市/上櫃辨識與 Yahoo ticker 轉換
- `lib/calculations.ts`：持倉與推薦績效計算
- `lib/investmentService.ts`：API 使用的 application service
- `lib/types.ts`：完整 TypeScript models
- `components/investment-dashboard.tsx`：Dashboard、篩選、CRUD UI

## 部署

Vercel 最簡單：

1. 匯入 GitHub repo
2. 確認 `data/*.csv` 已更新
3. Deploy

其他 Node.js 平台：

```bash
npm run build
npm run start
```
