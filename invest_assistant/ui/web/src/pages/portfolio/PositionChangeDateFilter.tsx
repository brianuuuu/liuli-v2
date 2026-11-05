import { DatePicker } from "antd";
import { buildPositionChangeReviewRange } from "./positionChangeReviewRange";
import type { PositionChangeReviewRange } from "./positionChangeReviewRange";

export function PositionChangeDateFilter({ value, onChange }: {
  value: PositionChangeReviewRange;
  onChange: (range: PositionChangeReviewRange) => void;
}) {
  return (
    <DatePicker.RangePicker
      size="small"
      className="position-change-date-filter"
      aria-label="调仓日期范围"
      value={value}
      format="YYYY-MM-DD"
      allowClear={false}
      placeholder={["开始日期", "结束日期"]}
      presets={[
        { label: "近一星期", value: () => buildPositionChangeReviewRange("week") },
        { label: "近一个月", value: () => buildPositionChangeReviewRange("month") },
        { label: "近三个月", value: () => buildPositionChangeReviewRange("quarter") }
      ]}
      onChange={(range) => {
        if (range?.[0] && range[1]) onChange([range[0], range[1]]);
      }}
    />
  );
}
