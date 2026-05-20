import { Plus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { RecommendationInput, StockQuote, StockSheet } from "../../types/stock";

interface StockToolbarProps {
  sheets: StockSheet[];
  activeSheet: StockSheet;
  quotes: StockQuote[];
  onAddSheet: (name: string) => void;
  onSelectSheet: (id: string) => void;
  onUpsertRecommendation: (recommendation: RecommendationInput) => void;
}

export function StockToolbar({
  sheets,
  activeSheet,
  quotes,
  onAddSheet,
  onSelectSheet,
  onUpsertRecommendation
}: StockToolbarProps) {
  const [sheetName, setSheetName] = useState("");
  const [query, setQuery] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [recommendationPrice, setRecommendationPrice] = useState("");
  const [recommendationDate, setRecommendationDate] = useState(new Date().toISOString().slice(0, 10));
  const [rating, setRating] = useState("觀察");
  const [analyst, setAnalyst] = useState("Kevin");
  const quoteIndex = useMemo(() => quotes.map((quote) => `${quote.symbol} ${quote.name}`).slice(0, 3500), [quotes]);

  function submitSheet(event: FormEvent) {
    event.preventDefault();
    const name = sheetName.trim();
    if (!name) return;
    onAddSheet(name);
    setSheetName("");
  }

  function submitRecommendation(event: FormEvent) {
    event.preventDefault();
    const quote = resolveQuote(query, quotes);
    if (!quote) return;
    const target = Number(targetPrice) || quote.currentPrice;
    onUpsertRecommendation({
      symbol: quote.symbol,
      targetPrice: target,
      recommendationPrice: Number(recommendationPrice) || quote.currentPrice,
      recommendationDate,
      analyst: analyst.trim() || "未指定",
      rating,
      note: ""
    });
    setQuery("");
    setTargetPrice("");
    setRecommendationPrice("");
  }

  return (
    <section className="toolbar" aria-label="股票分析工具列">
      <div className="list-bar">
        <div className="list-tabs" role="tablist" aria-label="選股清單">
          {sheets.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              className={sheet.id === activeSheet.id ? "active" : ""}
              onClick={() => onSelectSheet(sheet.id)}
            >
              {sheet.name} {sheet.recommendations.length}
            </button>
          ))}
        </div>
        <form className="list-form" onSubmit={submitSheet}>
          <input value={sheetName} onChange={(event) => setSheetName(event.target.value)} placeholder="新增清單" />
          <button type="submit">新增</button>
        </form>
      </div>

      <form className="add-form analytics-form" onSubmit={submitRecommendation}>
        <label>
          代號或名稱
          <input list="stock-options" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="2327 或 國巨" />
          <datalist id="stock-options">
            {quoteIndex.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>
        <label>
          目標價
          <input value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          推薦價
          <input value={recommendationPrice} onChange={(event) => setRecommendationPrice(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          推薦日期
          <input type="date" value={recommendationDate} onChange={(event) => setRecommendationDate(event.target.value)} />
        </label>
        <label>
          評等
          <select value={rating} onChange={(event) => setRating(event.target.value)}>
            <option>強力買進</option>
            <option>買進</option>
            <option>觀察</option>
            <option>保守</option>
          </select>
        </label>
        <label>
          推薦人
          <input value={analyst} onChange={(event) => setAnalyst(event.target.value)} />
        </label>
        <button type="submit" className="primary-button">
          <Plus size={16} />
          加入
        </button>
      </form>
    </section>
  );
}

function resolveQuote(query: string, quotes: StockQuote[]): StockQuote | undefined {
  const normalized = query.trim().toLowerCase();
  const code = normalized.match(/\d{4,6}/)?.[0];
  if (code) return quotes.find((quote) => quote.symbol === code);
  return quotes.find((quote) => quote.name.toLowerCase().includes(normalized));
}
