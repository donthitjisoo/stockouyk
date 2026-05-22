import { createTtlCache, fetchJson, logFallback } from "./providerUtils.mjs";

const cache = createTtlCache(24 * 60 * 60 * 1000);

const fallbackTickers = {
  "0050": ticker("0050", "0050.TW", "TWSE", "上市", "元大台灣50", "ETF"),
  "2330": ticker("2330", "2330.TW", "TWSE", "上市", "台積電", "半導體"),
  "2317": ticker("2317", "2317.TW", "TWSE", "上市", "鴻海", "電子代工"),
  "2454": ticker("2454", "2454.TW", "TWSE", "上市", "聯發科", "IC設計"),
  "2327": ticker("2327", "2327.TW", "TWSE", "上市", "國巨", "被動元件"),
  "2308": ticker("2308", "2308.TW", "TWSE", "上市", "台達電", "電源"),
  "2882": ticker("2882", "2882.TW", "TWSE", "上市", "國泰金", "金融"),
  "3661": ticker("3661", "3661.TWO", "TPEX", "上櫃", "世芯-KY", "IC設計"),
  "3163": ticker("3163", "3163.TWO", "TPEX", "上櫃", "波若威", "通訊網路"),
  "6488": ticker("6488", "6488.TWO", "TPEX", "上櫃", "環球晶", "半導體")
};

export async function resolveTaiwanTickers(symbols) {
  const key = "taiwan-tickers";
  const cached = cache.get(key);
  if (cached) return Object.fromEntries(symbols.map((symbol) => [symbol, cached[symbol] || fallbackUnknown(symbol)]));

  const tickers = { ...fallbackTickers };
  await Promise.allSettled([loadTwseTickers(tickers), loadTpexTickers(tickers)]);
  cache.set(key, tickers);
  return Object.fromEntries(symbols.map((symbol) => [symbol, tickers[symbol] || fallbackUnknown(symbol)]));
}

async function loadTwseTickers(target) {
  try {
    const data = await fetchJson("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", {
      timeoutMs: 7000,
      retries: 1,
      label: "TWSE resolver"
    });
    for (const row of data) {
      const symbol = row.Code || row["證券代號"];
      const name = row.Name || row["證券名稱"];
      if (symbol) target[symbol] = ticker(symbol, `${symbol}.TW`, "TWSE", "上市", name, guessSector(symbol));
    }
  } catch (error) {
    logFallback("resolver", "TWSE", error);
  }
}

async function loadTpexTickers(target) {
  try {
    const data = await fetchJson("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes", {
      timeoutMs: 7000,
      retries: 1,
      label: "TPEX resolver"
    });
    for (const row of data) {
      const symbol = row.SecuritiesCompanyCode || row.Code || row["代號"];
      const name = row.CompanyName || row.Name || row["名稱"];
      if (symbol) target[symbol] = ticker(symbol, `${symbol}.TWO`, "TPEX", "上櫃", name, guessSector(symbol));
    }
  } catch (error) {
    logFallback("resolver", "TPEX", error);
  }
}

export function guessSector(symbol) {
  const code = Number(symbol);
  if (symbol.startsWith("28")) return "金融";
  if (symbol.startsWith("23") || symbol.startsWith("24") || symbol.startsWith("30") || symbol.startsWith("34") || symbol.startsWith("36")) return "電子";
  if (symbol.startsWith("26")) return "航運";
  if (symbol.startsWith("13")) return "塑化";
  if (symbol.startsWith("14")) return "紡織";
  if (symbol.startsWith("15") || symbol.startsWith("45")) return "機電";
  if (symbol.startsWith("17")) return "化學生技";
  if (symbol.startsWith("20")) return "鋼鐵";
  if (symbol.startsWith("25") || symbol.startsWith("55")) return "營建";
  if (code < 1000) return "ETF";
  return "其他";
}

function fallbackUnknown(symbol) {
  return { ...ticker(symbol, `${symbol}.TW`, "UNKNOWN", "未知", symbol, guessSector(symbol)), dataStatus: "resolver_failed" };
}

function ticker(symbol, yahooSymbol, market, marketName, name, sector) {
  return { symbol, yahooSymbol, market, marketName, name, sector };
}
