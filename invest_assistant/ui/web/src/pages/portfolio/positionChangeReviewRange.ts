import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

export type PositionChangeReviewRange = [Dayjs, Dayjs];
type PositionChangeReviewPeriod = "week" | "month" | "quarter";

/** 月份按自然月回退；近一星期含当天共七天。 */
export function buildPositionChangeReviewRange(period: PositionChangeReviewPeriod = "month", today = dayjs()): PositionChangeReviewRange {
  const end = today.startOf("day");
  const start = period === "week" ? end.subtract(6, "day") : end.subtract(period === "quarter" ? 3 : 1, "month");
  return [start, end];
}

export function positionChangeReviewRangeParams(range: PositionChangeReviewRange) {
  return { start_date: range[0].format("YYYY-MM-DD"), end_date: range[1].format("YYYY-MM-DD") };
}
