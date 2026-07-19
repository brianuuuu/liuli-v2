import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export function MiniChart({ labels, values }: { labels: string[]; values: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      animationDuration: 260,
      grid: { left: 4, right: 4, top: 8, bottom: 4, containLabel: false },
      xAxis: { type: "category", show: false, data: labels },
      yAxis: { type: "value", show: false, scale: true },
      tooltip: { trigger: "axis" },
      series: [{
        type: "line",
        data: values,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 2, color: "#2563eb" },
        areaStyle: { color: "rgba(37, 99, 235, .10)" }
      }]
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => { observer.disconnect(); chart.dispose(); };
  }, [labels, values]);
  return <div className="mini-chart" ref={ref} aria-label="趋势图" />;
}
