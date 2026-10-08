import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { mobileApi } from "../api/mobileApi";
import { ErrorState, LoadingState } from "../components/Ui";
import type { AdjustAdviceCandidate, PortfolioPositionRow } from "../types/api";
import { formatMoney } from "../utils/format";
import { DetailFrame } from "./DetailPages";
import {
  REASON_TYPE_LABELS,
  TRADE_REASON_OPTIONS,
  TRADE_SIDE_OPTIONS,
  adviceActionForSide,
  estimateAllocation,
  formatTradeQuantity,
  lastTradePortfolio,
  quantityAfterTrade,
  rememberTradePortfolio,
  validateTradeDraft,
  type TradeReasonType,
  type TradeSide
} from "./tradeRecord";

type SelectedStock = { id: number; name: string; code?: string | null };

function todayInShanghai() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

function parseNumber(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() && Number.isFinite(value) ? value : null;
}

function formatRatio(value: number | null) {
  return value === null ? "--" : `${(value * 100).toFixed(1)}%`;
}

export function TradeRecordPage() {
  const [params] = useSearchParams();
  const fixedPortfolioId = Number(params.get("portfolio_id")) || null;
  const navigate = useNavigate();
  const client = useQueryClient();
  const today = todayInShanghai();

  const [portfolioId, setPortfolioId] = useState<number | null>(fixedPortfolioId ?? lastTradePortfolio());
  const [stock, setStock] = useState<SelectedStock | null>(null);
  const [keyword, setKeyword] = useState("");
  const [side, setSide] = useState<TradeSide>("buy");
  const [quantityText, setQuantityText] = useState("");
  const [priceText, setPriceText] = useState("");
  const [tradeDate, setTradeDate] = useState(today);
  const [reasonType, setReasonType] = useState<TradeReasonType | null>(null);
  const [adviceId, setAdviceId] = useState<number | null>(null);
  const [syncCash, setSyncCash] = useState(true);
  const [note, setNote] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");

  const overview = useQuery({ queryKey: ["portfolio-overview", null], queryFn: () => mobileApi.portfolioOverview(null), staleTime: 300_000 });
  const portfolioOptions = overview.data?.portfolio_options ?? [];
  // 进页面就重新取，不用看板的 5 分钟缓存：确认页的占比要按最新持仓和现金估算
  const detail = useQuery({
    queryKey: ["portfolio-detail", portfolioId],
    queryFn: () => mobileApi.portfolioDetail(portfolioId as number),
    enabled: Boolean(portfolioId),
    staleTime: 0
  });
  const groups = useQuery({
    queryKey: ["portfolio-groups", portfolioId],
    queryFn: () => mobileApi.portfolioGroups(portfolioId as number),
    enabled: Boolean(portfolioId)
  });
  const search = useQuery({
    queryKey: ["stock-options", keyword.trim()],
    queryFn: () => mobileApi.stockOptions(keyword.trim()),
    enabled: !stock && Boolean(keyword.trim())
  });
  const adviceAction = adviceActionForSide(side);
  const candidates = useQuery({
    queryKey: ["advice-candidates", portfolioId, stock?.id, tradeDate],
    queryFn: () => mobileApi.adviceCandidates(portfolioId as number, stock?.id as number, tradeDate),
    enabled: Boolean(portfolioId && stock && reasonType === "ai_advice")
  });
  const matchingCandidates = (candidates.data ?? []).filter((item) => item.action === adviceAction);

  const positions = detail.data?.positions ?? [];
  const holding: PortfolioPositionRow | undefined = stock ? positions.find((item) => item.stock_id === stock.id) : undefined;
  const held = holding?.quantity ?? 0;
  const quantity = side === "close" ? held : parseNumber(quantityText);
  const price = parseNumber(priceText);
  const error = validateTradeDraft({ portfolioId, stockId: stock?.id ?? null, held, side, quantity, price, tradeDate, today });
  const quantityAfter = quantityAfterTrade(held, side, quantity ?? 0);
  const estimate = useMemo(
    () => stock
      ? estimateAllocation({
        positions,
        cash: Number(detail.data?.summary.cash_amount ?? 0),
        stockId: stock.id,
        quantityAfter,
        price,
        syncCash
      })
      : null,
    [detail.data, positions, price, quantityAfter, stock, syncCash]
  );
  const group = holding?.group_id ? groups.data?.find((item) => item.id === holding.group_id) : undefined;
  const selectedAdvice = matchingCandidates.find((item) => item.id === adviceId);

  const submit = useMutation({
    mutationFn: () => mobileApi.recordTrade(portfolioId as number, {
      stock_id: stock?.id as number,
      side,
      quantity: side === "close" ? null : quantity,
      price,
      trade_date: tradeDate,
      reason_type: reasonType,
      advice_item_id: reasonType === "ai_advice" ? adviceId : null,
      sync_cash: syncCash,
      note: note.trim() || null
    }),
    onSuccess: async () => {
      rememberTradePortfolio(portfolioId as number);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["portfolio-overview"] }),
        client.invalidateQueries({ queryKey: ["portfolio-trades"] }),
        client.invalidateQueries({ queryKey: ["portfolio-detail"] }),
        client.invalidateQueries({ queryKey: ["workbench-today"] })
      ]);
      navigate("/dashboard", { replace: true });
    }
  });

  const changeSide = (next: TradeSide) => {
    setSide(next);
    setAdviceId(null);
  };
  const pickStock = (next: SelectedStock) => {
    setStock(next);
    setKeyword("");
    setAdviceId(null);
    const owned = positions.some((item) => item.stock_id === next.id);
    if (!owned) setSide("buy");
  };

  if (overview.isLoading) return <DetailFrame title="记一笔调仓"><LoadingState /></DetailFrame>;
  if (overview.isError) return <DetailFrame title="记一笔调仓"><ErrorState onRetry={() => void overview.refetch()} /></DetailFrame>;

  const portfolioName = portfolioOptions.find((item) => item.id === portfolioId)?.name ?? "";
  const stockLabel = stock ? `${stock.name}${stock.code ? ` ${stock.code}` : ""}` : "";

  if (step === "confirm" && stock && estimate) {
    const delta = quantityAfter - held;
    return (
      <DetailFrame title="确认调仓">
        <div className="trade-confirm">
          <h2>{portfolioName} · {stock.name}</h2>
          <dl>
            <dt>股数</dt>
            <dd>{formatTradeQuantity(held)} → {formatTradeQuantity(quantityAfter)}（{side === "close" ? "清仓" : `${delta > 0 ? "+" : "−"}${formatTradeQuantity(Math.abs(delta))}`}）</dd>
            <dt>仓位占比</dt>
            <dd>
              {formatRatio(estimate.weightBefore)} → {formatRatio(estimate.weightAfter)}
              {group ? <small>分组：{group.name}{group.target_weight !== null && group.target_weight !== undefined ? ` 目标 ${formatRatio(group.target_weight)}` : ""}</small> : null}
            </dd>
            <dt>现金占比</dt>
            <dd>
              {formatRatio(estimate.cashRatioBefore)} → {formatRatio(estimate.cashRatioAfter)}
              <small>{syncCash ? (estimate.cashDelta === null ? "同步现金：暂无价格，不同步" : `同步现金 ${estimate.cashDelta > 0 ? "+" : ""}${formatMoney(estimate.cashDelta)}`) : "不同步现金"}</small>
            </dd>
            <dt>理由</dt>
            <dd>{reasonType ? REASON_TYPE_LABELS[reasonType] : "未填写"}{selectedAdvice ? `（${selectedAdvice.target_trade_date} ${selectedAdvice.action === "add" ? "增持" : "减持"}）` : ""}</dd>
            <dt>日期</dt>
            <dd>{tradeDate} · {price !== null ? `成交价 ${price}` : "成交价由系统估算"}</dd>
            {note.trim() ? <><dt>备注</dt><dd>{note.trim()}</dd></> : null}
          </dl>
          <p className="trade-hint">占比按当前持仓和现价估算，最终以记录后的数据为准。</p>
          {submit.isError ? <span className="form-error">{submit.error instanceof ApiError && submit.error.detail ? `记录失败：${submit.error.detail}` : "记录失败，请重试"}</span> : null}
          <div className="suggestion-review-submit">
            <button type="button" className="text-button" disabled={submit.isPending} onClick={() => setStep("edit")}>返回修改</button>
            <button type="button" className="primary-button" disabled={submit.isPending} onClick={() => submit.mutate()}>
              <Check size={17} />{submit.isPending ? "记录中…" : "确认记录"}
            </button>
          </div>
        </div>
      </DetailFrame>
    );
  }

  const searchResults = search.data ?? [];
  return (
    <DetailFrame title="记一笔调仓">
      <div className="suggestion-review-form trade-form">
        <label>组合
          {fixedPortfolioId ? <input value={portfolioName} disabled /> : (
            <select
              value={portfolioId ?? ""}
              onChange={(event) => {
                setPortfolioId(Number(event.target.value) || null);
                setStock(null);
                setAdviceId(null);
              }}
            >
              <option value="">请选择组合</option>
              {portfolioOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          )}
        </label>

        <div className="trade-field">
          <span>标的</span>
          {stock ? (
            <div className="trade-selected">
              <strong>{stockLabel}</strong>
              <small>{holding ? `持有 ${formatTradeQuantity(held)} 股` : "未持有，记为新建仓"}</small>
              <button type="button" className="text-button" onClick={() => setStock(null)}>更换</button>
            </div>
          ) : (
            <>
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索名称 / 代码 / 拼音" disabled={!portfolioId} />
              <div className="trade-options">
                {keyword.trim()
                  ? searchResults.map((item) => (
                    <button type="button" key={item.id} onClick={() => pickStock({ id: item.id, name: item.stock_name || item.name || item.stock_code || "未命名标的", code: item.stock_code })}>
                      <strong>{item.stock_name || item.name || item.stock_code}</strong><small>{item.stock_code}</small>
                    </button>
                  ))
                  : positions.map((item) => (
                    <button type="button" key={item.stock_id} onClick={() => pickStock({ id: item.stock_id, name: item.stock_name || item.stock_code || "未命名标的", code: item.stock_code })}>
                      <strong>{item.stock_name || item.stock_code}</strong><small>{formatTradeQuantity(item.quantity)} 股</small>
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>

        <div className="trade-field">
          <span>方向</span>
          <div className="portfolio-segments" role="group" aria-label="方向">
            {TRADE_SIDE_OPTIONS.map((item) => (
              <button type="button" key={item.key} className={side === item.key ? "is-active" : ""} disabled={item.key !== "buy" && held <= 0} onClick={() => changeSide(item.key)}>{item.label}</button>
            ))}
          </div>
        </div>

        <label>成交股数
          <input
            inputMode="decimal"
            value={side === "close" ? String(held) : quantityText}
            disabled={side === "close"}
            onChange={(event) => setQuantityText(event.target.value)}
            placeholder="本次成交数量"
          />
        </label>

        <div className="trade-field">
          <span>理由来源</span>
          <div className="portfolio-segments" role="group" aria-label="理由来源">
            {TRADE_REASON_OPTIONS.map((item) => (
              <button
                type="button"
                key={item.key}
                className={reasonType === item.key ? "is-active" : ""}
                onClick={() => {
                  setReasonType(reasonType === item.key ? null : item.key);
                  setAdviceId(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {reasonType === "ai_advice" ? (
          <div className="trade-field">
            <span>关联微操建议</span>
            {!stock ? <small className="trade-hint">先选择标的</small> : candidates.isLoading ? <LoadingState /> : matchingCandidates.length ? (
              <div className="trade-options">
                {matchingCandidates.map((item: AdjustAdviceCandidate) => (
                  <button type="button" key={item.id} className={adviceId === item.id ? "is-active" : ""} onClick={() => setAdviceId(adviceId === item.id ? null : item.id)}>
                    <strong>{item.target_trade_date} {item.action === "add" ? "增持" : "减持"}{item.quantity ? ` ${formatTradeQuantity(item.quantity)} 股` : ""}</strong>
                    <small>{item.price_low !== null && item.price_low !== undefined ? `${item.price_low}—${item.price_high}` : ""}</small>
                  </button>
                ))}
              </div>
            ) : <small className="trade-hint">近 10 天没有这只标的的{adviceAction === "add" ? "增持" : "减持"}建议，可不关联</small>}
          </div>
        ) : null}

        <label className="trade-switch">
          <span>同步现金<small>按 股数 × 成交价 增减现金余额，手续费等误差仍靠现金校准</small></span>
          <input type="checkbox" checked={syncCash} onChange={(event) => setSyncCash(event.target.checked)} />
        </label>

        <label>备注<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="选填" /></label>

        <button type="button" className="text-button trade-more" onClick={() => setShowMore(!showMore)}>{showMore ? "收起" : "更多：成交价、日期"}</button>
        {showMore ? (
          <>
            <label>成交价
              <input inputMode="decimal" value={priceText} onChange={(event) => setPriceText(event.target.value)} placeholder={holding?.current_price ? `留空按收盘价估算，现价 ${holding.current_price}` : "留空按收盘价估算"} />
            </label>
            <label>日期<input type="date" value={tradeDate} max={today} onChange={(event) => setTradeDate(event.target.value || today)} /></label>
          </>
        ) : null}

        {stock && error ? <span className="form-error">{error}</span> : null}
        <button type="button" className="primary-button" disabled={Boolean(error) || detail.isLoading} onClick={() => setStep("confirm")}>下一步</button>
      </div>
    </DetailFrame>
  );
}
