import * as echarts from "echarts/core";
import { BarChart, RadarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import {
  STOCK_CHART_BAR_MAX_WIDTH,
  STOCK_CHART_BAR_RADIUS,
  stockChartPalette
} from "./stockCharts";

echarts.use([BarChart, RadarChart, GridComponent, TooltipComponent, CanvasRenderer]);

function useEchart(option: unknown, height: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option as never);
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [option]);
  return <div className="stock-detail-chart" style={{ height }} ref={ref} data-swipe-ignore="true" />;
}

export function RatingRadar({ dimensions }: { dimensions: { name: string; value: number }[] }) {
  const palette = stockChartPalette();
  return useEchart({
    animationDuration: 260,
    radar: {
      center: ["50%", "54%"],
      radius: "66%",
      splitNumber: 4,
      indicator: dimensions.map((item) => ({ name: item.name, max: 10 })),
      axisName: { color: palette.text, fontSize: 11 },
      axisLine: { lineStyle: { color: palette.grid } },
      splitLine: { lineStyle: { color: palette.grid } },
      splitArea: { areaStyle: { color: palette.splitArea } }
    },
    series: [{
      type: "radar",
      symbol: "circle",
      symbolSize: 4,
      lineStyle: { width: 2, color: palette.accent },
      itemStyle: { color: palette.accent },
      areaStyle: { color: palette.accent, opacity: 0.2 },
      data: [{ value: dimensions.map((item) => item.value) }]
    }]
  }, 220);
}

export function ScoreTrendBar({ labels, values }: { labels: string[]; values: number[] }) {
  const palette = stockChartPalette();
  return useEchart({
    animationDuration: 260,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 26, right: 8, top: 12, bottom: 24 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: palette.text, fontSize: 10, interval: 0, hideOverlap: true },
      axisLine: { lineStyle: { color: palette.grid } },
      axisTick: { show: false }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 10,
      interval: 5,
      axisLabel: { color: palette.text, fontSize: 10 },
      splitLine: { lineStyle: { color: palette.grid } }
    },
    series: [{
      type: "bar",
      barMaxWidth: STOCK_CHART_BAR_MAX_WIDTH,
      itemStyle: { color: palette.accent, borderRadius: STOCK_CHART_BAR_RADIUS },
      data: values
    }]
  }, 180);
}
