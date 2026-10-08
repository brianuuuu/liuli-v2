import type { PositionChangeReasonType } from "../../types/api";

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
