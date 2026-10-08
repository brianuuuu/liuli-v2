import { describe, expect, it } from "vitest";
import {
  adviceActionForSide,
  estimateAllocation,
  quantityAfterTrade,
  tradeDeltaLabel,
  validateTradeDraft,
  type TradeDraft
} from "../src/pages/tradeRecord";

const draft = (overrides: Partial<TradeDraft> = {}): TradeDraft => ({
  portfolioId: 1,
  stockId: 7,
  held: 1000,
  side: "buy",
  quantity: 500,
  price: null,
  tradeDate: "2026-10-09",
  today: "2026-10-09",
  ...overrides
});

describe("trade record", () => {
  it("converts the filled trade size into the position after the trade", () => {
    expect(quantityAfterTrade(1000, "buy", 500)).toBe(1500);
    expect(quantityAfterTrade(1000, "sell", 300)).toBe(700);
    expect(quantityAfterTrade(1000, "close", 0)).toBe(0);
  });

  it("only links advice that points the same way as the trade", () => {
    expect(adviceActionForSide("buy")).toBe("add");
    expect(adviceActionForSide("sell")).toBe("reduce");
    expect(adviceActionForSide("close")).toBe("reduce");
  });

  it("stops obviously wrong drafts before they reach the server", () => {
    expect(validateTradeDraft(draft())).toBeNull();
    expect(validateTradeDraft(draft({ portfolioId: null }))).toBe("请选择组合");
    expect(validateTradeDraft(draft({ stockId: null }))).toBe("请选择标的");
    expect(validateTradeDraft(draft({ quantity: 0 }))).toBe("请输入成交股数");
    expect(validateTradeDraft(draft({ side: "sell", quantity: 1200 }))).toContain("不能超过现有持仓");
    expect(validateTradeDraft(draft({ side: "sell", held: 0 }))).toContain("只能买入");
    expect(validateTradeDraft(draft({ side: "close", quantity: null }))).toBeNull();
    expect(validateTradeDraft(draft({ price: -1 }))).toBe("成交价必须大于 0");
    expect(validateTradeDraft(draft({ tradeDate: "2026-10-10" }))).toBe("日期不能晚于今天");
  });

  it("estimates position and cash weights with cash synced", () => {
    // 持仓 10000 + 其他 30000 + 现金 60000 = 100000；按现价 10 买 500 股，现金 −5000
    const estimate = estimateAllocation({
      positions: [
        { stock_id: 7, quantity: 1000, market_value: 10_000, current_price: 10 },
        { stock_id: 8, quantity: 100, market_value: 30_000, current_price: 300 }
      ],
      cash: 60_000,
      stockId: 7,
      quantityAfter: 1500,
      price: null,
      syncCash: true
    });
    expect(estimate.weightBefore).toBeCloseTo(0.1);
    expect(estimate.weightAfter).toBeCloseTo(0.15);
    expect(estimate.cashRatioBefore).toBeCloseTo(0.6);
    expect(estimate.cashRatioAfter).toBeCloseTo(0.55);
    expect(estimate.cashDelta).toBeCloseTo(-5000);
  });

  it("grows the total when cash is not synced", () => {
    const estimate = estimateAllocation({
      positions: [{ stock_id: 7, quantity: 1000, market_value: 10_000, current_price: 10 }],
      cash: 90_000,
      stockId: 7,
      quantityAfter: 2000,
      price: 10,
      syncCash: false
    });
    expect(estimate.cashDelta).toBe(0);
    expect(estimate.weightAfter).toBeCloseTo(20_000 / 110_000);
    expect(estimate.cashRatioAfter).toBeCloseTo(90_000 / 110_000);
  });

  it("cannot estimate a brand-new position without any price", () => {
    const estimate = estimateAllocation({
      positions: [],
      cash: 50_000,
      stockId: 9,
      quantityAfter: 100,
      price: null,
      syncCash: true
    });
    expect(estimate.weightAfter).toBeNull();
    expect(estimate.cashRatioBefore).toBe(1);
  });

  it("labels recent trades", () => {
    expect(tradeDeltaLabel({ quantity_delta: 500, quantity_after: 1500 })).toBe("+500 股");
    expect(tradeDeltaLabel({ quantity_delta: -300, quantity_after: 700 })).toBe("−300 股");
    expect(tradeDeltaLabel({ quantity_delta: -700, quantity_after: 0 })).toBe("清仓");
  });
});
