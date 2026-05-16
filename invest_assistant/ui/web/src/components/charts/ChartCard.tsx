import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import { useLiuliTheme } from "../../app/theme";
import { WorkbenchCard } from "../common/WorkbenchCard";
import { chartBackgroundColor } from "./chartTheme";

type ChartCardProps = {
  title: string;
  option: EChartsOption;
  height?: number;
  extra?: ReactNode;
};

export function ChartCard({ title, option, height = 280, extra }: ChartCardProps) {
  const { resolvedMode } = useLiuliTheme();
  return (
    <WorkbenchCard title={title} extra={extra}>
      <ReactECharts
        option={{ backgroundColor: chartBackgroundColor(resolvedMode), ...option }}
        style={{ height, width: "100%" }}
        notMerge
      />
    </WorkbenchCard>
  );
}
