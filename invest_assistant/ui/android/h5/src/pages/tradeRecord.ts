/**
 * 手机端记一笔调仓的纯逻辑：股数换算、校验和确认页的配置占比估算。
 * 琉璃关心资源配置是否合理，不关心买入成本，所以这里只算数量和占比，不算盈亏。
 */

export type TradeSide = "buy" | "sell" | "close";
export type TradeReasonType = "ai_advice" | "personal" | "fund_allocation" | "other";

export const TRADE_SIDE_OPTIONS: Array<{ key: TradeSide; label: string }> = [
  { key: "buy", label: "买入" },
  { key: "sell", label: "卖出" },
  { key: "close", label: "清仓" }
];

// 公司行为（送转、配股）不是手机上下的单，只在 Web 上记
export const TRADE_REASON_OPTIONS: Array<{ key: TradeReasonType; label: string }> = [
  { key: "ai_advice", label: "AI 建议" },
  { key: "personal", label: "个人判断" },
  { key: "fund_allocation", label: "资金调配" },
  { key: "other", label: "其他" }
];

export const REASON_TYPE_LABELS: Record<string, string> = {
  ai_advice: "AI 建议",
  personal: "个人判断",
  fund_allocation: "资金调配",
  corporate_action: "公司行为",
  other: "其他"
};

/** 微操建议的方向：买入只能关联增持，卖出和清仓只能关联减持。 */
export function adviceActionForSide(side: TradeSide): "add" | "reduce" {
  return side === "buy" ? "add" : "reduce";
}

export function quantityAfterTrade(before: number, side: TradeSide, quantity: number): number {
  if (side === "close") return 0;
  return side === "buy" ? before + quantity : before - quantity;
}

export type TradeDraft = {
  portfolioId: number | null;
  stockId: number | null;
  held: number;
  side: TradeSide;
  quantity: number | null;
  price: number | null;
  tradeDate: string;
  today: string;
};

/** 返回第一条不满足的原因；全部满足返回 null。服务端会再校验一遍，这里只为提前拦住。 */
export function validateTradeDraft(draft: TradeDraft): string | null {
  if (!draft.portfolioId) return "请选择组合";
  if (!draft.stockId) return "请选择标的";
  if (draft.side !== "buy" && draft.held <= 0) return "没有这只标的的持仓，只能买入";
  if (draft.side !== "close") {
    if (draft.quantity === null || !(draft.quantity > 0)) return "请输入成交股数";
    if (draft.side === "sell" && draft.quantity > draft.held) return `卖出不能超过现有持仓 ${draft.held} 股`;
  }
  if (draft.price !== null && !(draft.price > 0)) return "成交价必须大于 0";
  if (draft.tradeDate > draft.today) return "日期不能晚于今天";
  return null;
}

export type AllocationPosition = {
  stock_id: number;
  quantity: number;
  market_value?: number | null;
  current_price?: number | null;
};

export type AllocationEstimate = {
  weightBefore: number | null;
  weightAfter: number | null;
  cashRatioBefore: number | null;
  cashRatioAfter: number | null;
  cashDelta: number | null;
};

/**
 * 估算这笔调仓前后，该标的和现金在组合里的占比。
 * 持仓按现价估值（没有现价才退回成交价）；同步现金时现金按 成交价 × 股数 增减。
 * 只是确认页的提示，最终以服务端结果为准。
 */
export function estimateAllocation(input: {
  positions: AllocationPosition[];
  cash: number;
  stockId: number;
  quantityAfter: number;
  price: number | null;
  syncCash: boolean;
}): AllocationEstimate {
  const target = input.positions.find((item) => item.stock_id === input.stockId);
  const quantityBefore = target?.quantity ?? 0;
  const valuationPrice = target?.current_price ?? input.price;
  const tradePrice = input.price ?? target?.current_price ?? null;
  const positionsValue = input.positions.reduce((sum, item) => sum + Number(item.market_value ?? 0), 0);
  const totalBefore = positionsValue + input.cash;
  const valueBefore = Number(target?.market_value ?? (valuationPrice !== null ? quantityBefore * valuationPrice : 0));
  const cashDelta = input.syncCash && tradePrice !== null ? -(input.quantityAfter - quantityBefore) * tradePrice : input.syncCash ? null : 0;
  if (valuationPrice === null || cashDelta === null) {
    return {
      weightBefore: ratio(valueBefore, totalBefore),
      weightAfter: null,
      cashRatioBefore: ratio(input.cash, totalBefore),
      cashRatioAfter: null,
      cashDelta
    };
  }
  const valueAfter = input.quantityAfter * valuationPrice;
  const cashAfter = input.cash + cashDelta;
  const totalAfter = totalBefore - valueBefore + valueAfter + cashDelta;
  return {
    weightBefore: ratio(valueBefore, totalBefore),
    weightAfter: ratio(valueAfter, totalAfter),
    cashRatioBefore: ratio(input.cash, totalBefore),
    cashRatioAfter: ratio(cashAfter, totalAfter),
    cashDelta
  };
}

function ratio(value: number, total: number): number | null {
  return total > 0 ? value / total : null;
}

const LAST_PORTFOLIO_KEY = "liuli.mobile.trade.lastPortfolioId";

export function rememberTradePortfolio(portfolioId: number) {
  try {
    window.localStorage.setItem(LAST_PORTFOLIO_KEY, String(portfolioId));
  } catch {
    // 存不下只是少一个默认值，不影响记账
  }
}

export function lastTradePortfolio(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LAST_PORTFOLIO_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function formatTradeQuantity(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("zh-CN") : String(value);
}

/** 最近调仓的数量文案：清仓单独写，其余带正负号。 */
export function tradeDeltaLabel(change: { quantity_delta: number; quantity_after: number }): string {
  if (change.quantity_after === 0) return "清仓";
  const sign = change.quantity_delta > 0 ? "+" : "−";
  return `${sign}${formatTradeQuantity(Math.abs(change.quantity_delta))} 股`;
}
