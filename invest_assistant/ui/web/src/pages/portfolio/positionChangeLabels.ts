import type { AdjustAdviceCandidate, PositionChangeReasonType } from "../../types/api";

export const reasonTypeOptions: { value: PositionChangeReasonType; label: string }[] = [
  { value: "ai_advice", label: "AI建议" },
  { value: "personal", label: "个人判断" },
  { value: "fund_allocation", label: "资金调配" },
  { value: "corporate_action", label: "公司行为" },
  { value: "other", label: "其他" }
];

export const reasonTypeLabels: Record<string, string> = {
  ...Object.fromEntries(reasonTypeOptions.map((item) => [item.value, item.label])),
  unlabeled: "未标注"
};

export const reasonTypeColors: Record<string, string | undefined> = {
  ai_advice: "blue",
  personal: "purple",
  fund_allocation: "cyan",
  corporate_action: "default",
  other: "default"
};

export const adviceActionLabels: Record<string, string> = { add: "增持", reduce: "减持" };

/** 关联建议下拉的一项：已被别的调仓关联时写出那笔调仓，否则给价格区间 */
export function adviceCandidateLabel(item: AdjustAdviceCandidate, linked = Boolean(item.linked_change)) {
  const head = `${item.target_trade_date} ${adviceActionLabels[item.action] || item.action}${item.quantity ? ` ${item.quantity}股` : ""}`;
  if (linked && item.linked_change) {
    const delta = item.linked_change.quantity_delta;
    return `${head} · 已关联 ${item.linked_change.change_date.slice(5)} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}股`;
  }
  return item.price_low !== null && item.price_low !== undefined ? `${head} · ${item.price_low}—${item.price_high}` : head;
}
