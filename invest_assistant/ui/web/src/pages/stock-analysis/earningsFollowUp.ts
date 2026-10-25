import type { StockEarningsFollowUp } from "../../types/api";

const RESEARCH_LABELS: Record<StockEarningsFollowUp["missing"][number], string> = {
  valuation: "估值",
  score: "评分",
  trend: "趋势"
};

/** 红点的悬停提示：哪一期财报、还差哪几项。 */
export function earningsFollowUpTip(followUp: StockEarningsFollowUp): string {
  const missing = followUp.missing.map((item) => RESEARCH_LABELS[item] ?? item).join("、");
  return `${followUp.report_period} 财报待研究：${missing}`;
}
