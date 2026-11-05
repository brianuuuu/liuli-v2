import type { PositionChangeReviewDetail } from "../../types/api";

type AmountFields = Pick<PositionChangeReviewDetail, "amount" | "effect_to_date" | "impact_20d">;

export type AmountTotal = { value: number | null; missing: number };

function toCents(value: number) {
  const cents = Math.sign(value) * Math.round(Math.abs(value) * 100);
  return cents === 0 ? 0 : cents;
}

/** effect_to_date 已按增减方向折算，这里只乘金额，不再次按方向取反。 */
export function positionChangeToDateAmount(row: AmountFields): number | null {
  if (row.amount == null || row.effect_to_date == null || !Number.isFinite(row.amount) || !Number.isFinite(row.effect_to_date)) return null;
  const value = row.amount * row.effect_to_date;
  return Number.isFinite(value) ? toCents(value) / 100 : null;
}

function sumAmounts(values: readonly (number | null | undefined)[]): AmountTotal {
  let cents = 0;
  let known = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    cents += toCents(value);
    known += 1;
  }
  return { value: known ? cents / 100 : null, missing: values.length - known };
}

/** 输入当前组合的全部记录；不能使用 Table.summary 提供的当前页记录。 */
export function summarizePositionChangeAmounts(rows: readonly AmountFields[]) {
  return {
    amount: sumAmounts(rows.map((row) => row.amount)),
    toDateAmount: sumAmounts(rows.map(positionChangeToDateAmount)),
    impact20d: sumAmounts(rows.map((row) => row.impact_20d))
  };
}
