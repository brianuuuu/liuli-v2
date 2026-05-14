import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useLiuliTheme } from "../../app/theme";
import { WorkbenchCard } from "../common/WorkbenchCard";
import { chartBackgroundColor } from "./chartTheme";

type ChartCardProps = {
  title: string;
  option: EChartsOption;
  height?: number;
};

export function ChartCard({ title, option, height = 280 }: ChartCardProps) {
  const { resolvedMode } = useLiuliTheme();
  return (
    <WorkbenchCard title={title}>
      <ReactECharts
        option={{ backgroundColor: chartBackgroundColor(resolvedMode), ...option }}
        style={{ height, width: "100%" }}
        notMerge
      />
    </WorkbenchCard>
  );
}
