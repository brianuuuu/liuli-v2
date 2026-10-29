import * as echarts from "echarts/core";
import { BarChart, LineChart, RadarChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import {
  STOCK_CHART_BAR_MAX_WIDTH,
  STOCK_CHART_BAR_RADIUS,
  stockChartPalette
} from "./stockCharts";

echarts.use([BarChart, LineChart, RadarChart, GridComponent, CanvasRenderer]);

/**
 * 标的详情的图表都是纯展示：系列设 silent 不吃触摸，手指从图上起手也能横滑切子页签。
 * 选项对象每次渲染都是新的，按内容签名去重，父组件重渲染、横滑预挂载时不重建图表。
 */
function useEchart(option: unknown, height: number) {
  const ref = useRef<HTMLDivElement>(null);
  const optionRef = useRef(option);
  optionRef.current = option;
  const signature = JSON.stringify(option);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(optionRef.current as never);
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [signature]);
  return <div className="stock-detail-chart" style={{ height }} ref={ref} />;
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
      silent: true,
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
      silent: true,
      barMaxWidth: STOCK_CHART_BAR_MAX_WIDTH,
      itemStyle: { color: palette.accent, borderRadius: STOCK_CHART_BAR_RADIUS },
      data: values
    }]
  }, 180);
}

export type ResearchTrendKind = "score" | "trend" | "valuation";

/** 评分纵轴取整数上下界、等距刻度：跨度大于 4 分时两分一格，并把跨度补成偶数，刻度才不会参差。 */
export function scoreAxisRange(values: number[]) {
  let min = Math.max(0, Math.floor(Math.min(...values) - 0.5));
  let max = Math.min(10, Math.ceil(Math.max(...values) + 0.5));
  const interval = max - min > 4 ? 2 : 1;
  if ((max - min) % interval) {
    if (max < 10) max += 1;
    else min -= 1;
  }
  return { min, max, interval };
}

/**
 * 概览里的研究结论变化曲线。评分点上标评级字母；T 级用阶梯线，T0 在上；
 * 合理市值按数值缩放纵轴。最新一期的点放大一号。
 */
export function ResearchTrendLine({ kind, points }: {
  kind: ResearchTrendKind;
  points: { date: string; value: number; label: string }[];
}) {
  const palette = stockChartPalette();
  const sameYear = new Set(points.map((point) => point.date.slice(0, 4))).size <= 1;
  const last = points.length - 1;
  const yAxis = kind === "trend"
    ? { type: "value", inverse: true, min: 0, max: 5, interval: 1 }
    : kind === "score"
      ? { type: "value", ...scoreAxisRange(points.map((point) => point.value)) }
      : { type: "value", scale: true, splitNumber: 2 };
  return useEchart({
    animationDuration: 260,
    grid: { left: 4, right: 14, top: kind === "score" ? 22 : 12, bottom: 4, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: points.length === 1,
      data: points.map((point) => sameYear ? point.date.slice(5) : `${point.date.slice(2, 4)}/${point.date.slice(5, 7)}`),
      axisLabel: { color: palette.text, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: palette.grid } },
      axisTick: { show: false }
    },
    yAxis: {
      ...yAxis,
      axisLabel: {
        color: palette.text,
        fontSize: 10,
        formatter: kind === "trend"
          ? (value: number) => `T${value}`
          : (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: kind === "score" ? 1 : 0 })
      },
      splitLine: { lineStyle: { color: palette.grid } }
    },
    series: [{
      type: "line",
      silent: true,
      step: kind === "trend" ? "end" : undefined,
      symbol: "circle",
      lineStyle: { width: 2, color: palette.accent },
      itemStyle: { color: palette.accent },
      areaStyle: kind === "trend" ? undefined : { color: palette.accent, opacity: 0.08 },
      label: { show: kind === "score", position: "top", color: palette.text, fontSize: 10, fontWeight: 600 },
      data: points.map((point, index) => ({
        value: point.value,
        symbolSize: index === last ? 8 : 5,
        // 评分点上只标评级字母，分数看纵轴
        label: kind === "score" ? { formatter: point.label.split(" ")[0] } : undefined
      }))
    }]
  }, 118);
}
