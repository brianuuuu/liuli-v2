import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import { useLiuliTheme } from "../../app/theme";
import { WorkbenchCard } from "../common/WorkbenchCard";
import { chartBackgroundColor } from "./chartTheme";

type ChartCardProps = {
  title: string;
  option: EChartsOption;
  height?: number | string;
  extra?: ReactNode;
  onEvents?: Record<string, Function>;
  chartRef?: React.RefObject<any>;
  style?: React.CSSProperties;
};

export function ChartCard({ title, option, height = 280, extra, onEvents, chartRef, style }: ChartCardProps) {
  const { resolvedMode } = useLiuliTheme();
  return (
    <WorkbenchCard title={title} extra={extra} style={style}>
      <ReactECharts
        ref={chartRef}
        option={{ backgroundColor: chartBackgroundColor(resolvedMode), ...option }}
        style={{ height, width: "100%" }}
        onEvents={onEvents}
        notMerge
      />
    </WorkbenchCard>
  );
}
