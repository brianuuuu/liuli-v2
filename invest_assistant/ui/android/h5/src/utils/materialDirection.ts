/** 材料影响方向的展示口径：赛道用 support/weaken，标的用 positive/negative，沿用涨红跌绿。 */
const MATERIAL_DIRECTIONS: Record<string, { label: string; tone: string }> = {
  support: { label: "利好", tone: "positive" },
  positive: { label: "利好", tone: "positive" },
  weaken: { label: "利空", tone: "negative" },
  negative: { label: "利空", tone: "negative" },
  neutral: { label: "中性", tone: "neutral" }
};

/** 噪音和未知方向不出标签，由列表自身的“只看有效/看全部”开关表达。 */
export function materialDirectionPresentation(direction?: string | null) {
  return direction ? MATERIAL_DIRECTIONS[direction] : undefined;
}
