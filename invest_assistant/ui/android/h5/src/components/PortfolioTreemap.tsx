import * as echarts from "echarts/core";
import { TreemapChart } from "echarts/charts";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { buildPortfolioTreemapOption, type PortfolioTreemapItem, type TreemapRect } from "./portfolioTreemapOption";

echarts.use([TreemapChart, CanvasRenderer]);

type TreemapNode = {
  getId(): string;
  getLayout(): { width: number; height: number; borderWidth?: number } | undefined;
};
type TreemapSeriesModel = { getViewRoot(): { children: TreemapNode[] } };
type ChartWithModel = { getModel(): { getSeriesByIndex(index: number): TreemapSeriesModel | undefined } };

/**
 * 读出每个块排好后的尺寸。ECharts 没有公开接口给 treemap 块的位置，只能从 series 的视图根节点取；
 * 取不到时返回空表，块上文字退回按占比估算。
 */
function tileRects(chart: echarts.ECharts) {
  const rects = new Map<string, TreemapRect>();
  const series = (chart as unknown as ChartWithModel).getModel?.().getSeriesByIndex(0);
  for (const node of series?.getViewRoot?.().children ?? []) {
    const layout = node.getLayout();
    if (!layout) continue;
    const border = (layout.borderWidth ?? 0) * 2;
    rects.set(node.getId(), { width: layout.width - border, height: layout.height - border });
  }
  return rects;
}

export function PortfolioTreemap({ items }: { items: PortfolioTreemapItem[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    // 先排版拿到每个块的真实尺寸，再按尺寸重排块上文字；尺寸变了（转屏、宽度变化）重来一次
    const render = () => {
      chart.setOption(buildPortfolioTreemapOption(items, theme));
      const rects = tileRects(chart);
      if (rects.size) chart.setOption(buildPortfolioTreemapOption(items, theme, rects));
    };
    render();
    const observer = new ResizeObserver(() => {
      chart.resize();
      render();
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [items]);

  return <div className="portfolio-treemap" ref={ref} aria-label="持仓热力图" />;
}
