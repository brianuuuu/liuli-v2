import * as echarts from "echarts/core";
import { TreemapChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { buildPortfolioTreemapOption, type PortfolioTreemapItem } from "./portfolioTreemap";

echarts.use([TreemapChart, TooltipComponent, CanvasRenderer]);

export function PortfolioTreemap({ items }: { items: PortfolioTreemapItem[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    chart.setOption(buildPortfolioTreemapOption(items, theme));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [items]);

  return <div className="portfolio-treemap" ref={ref} aria-label="标的热力图" data-swipe-ignore="true" />;
}

