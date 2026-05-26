import type { EChartsOption } from "echarts";
import { Select } from "antd";
import { useCallback, useMemo, useState } from "react";
import { getStockHotwordGraph, getStockTrackGraph, type GraphType, type RankingWindow } from "../../../api/marketRadar";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { ChartCard } from "../../../components/charts/ChartCard";
import { DataPanel } from "../../../components/common/DataPanel";
import { useLiuliTheme } from "../../../app/theme";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { tagKey, windowOptions } from "./shared";

const graphTypeOptions = [
  { value: "track", label: "标的-赛道" },
  { value: "hotword", label: "标的-市场热词" }
];

export function GraphSection() {
  const { resolvedMode } = useLiuliTheme();
  const [type, setType] = useState<GraphType>("hotword");
  const [window, setWindow] = useState<RankingWindow>("24h");
  const graph = useAsyncData(
    useCallback(() => (type === "track" ? getStockTrackGraph(window) : getStockHotwordGraph(window)), [type, window]),
    { nodes: [], edges: [] }
  );

  const option = useMemo<EChartsOption>(() => {
    const isDark = resolvedMode === "dark";
    
    // Modern tech-palette colors
    const stockColor = isDark ? "#58a6ff" : "#2563eb"; 
    const relatedColor = type === "track" 
      ? (isDark ? "#bc8cff" : "#8b5cf6") 
      : (isDark ? "#ffaf40" : "#fb923c");
      
    const data = graph.data.nodes.map((node) => ({
      id: tagKey(node),
      name: node.name,
      symbolSize: node.type === "stock" ? 44 : 34,
      category: node.type === "stock" ? 0 : 1,
      itemStyle: {
        color: node.type === "stock" ? stockColor : relatedColor,
        borderWidth: 2,
        borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
        shadowBlur: 8,
        shadowColor: node.type === "stock" 
          ? (isDark ? "rgba(88, 166, 255, 0.2)" : "rgba(37, 99, 235, 0.12)")
          : (isDark ? "rgba(188, 140, 255, 0.2)" : "rgba(139, 92, 246, 0.12)")
      }
    }));

    const links = graph.data.edges
      .filter((edge) => edge.stock_tag && edge.related_tag)
      .map((edge) => ({
        source: tagKey(edge.stock_tag!),
        target: tagKey(edge.related_tag!),
        value: edge.weight,
        lineStyle: {
          color: isDark ? "rgba(255,255,255,0.18)" : "#e2e8f0",
          width: Math.max(1.5, Math.min(6, Number(edge.weight || 1)))
        }
      }));

    return {
      tooltip: {
        backgroundColor: isDark ? "#1f2937" : "#ffffff",
        borderColor: isDark ? "#374151" : "#e2e8f0",
        textStyle: { color: isDark ? "#f3f4f6" : "#1f2937" }
      },
      legend: [{
        data: ["标的", type === "track" ? "赛道" : "市场热词"],
        textStyle: { color: isDark ? "#9ca3af" : "#475569" }
      }],
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          categories: [
            { name: "标的", itemStyle: { color: stockColor } },
            { name: type === "track" ? "赛道" : "市场热词", itemStyle: { color: relatedColor } }
          ],
          data,
          links,
          force: { repulsion: 200, edgeLength: 100 },
          label: {
            show: true,
            position: "bottom",
            distance: 6,
            color: isDark ? "#cbd5e1" : "#334155",
            fontSize: 11,
            fontWeight: "500"
          }
        }
      ]
    };
  }, [graph.data, type, resolvedMode]);

  return (
    <DataPanel
      toolbar={
        <>
          <Select size="small" value={type} options={graphTypeOptions} style={{ width: 130 }} onChange={setType} />
          <div className="data-panel-toolbar-divider" />
          <Select size="small" value={window} options={windowOptions} style={{ width: 90 }} onChange={setWindow} />
          <div className="data-panel-toolbar-spacer" />
        </>
      }
    >
      {graph.data.nodes.length ? (
        <ChartCard
          title=""
          option={option}
          height={420}
        />
      ) : (
        <WorkbenchCard title="">
          <EmptyAction description={graph.loading ? "加载中" : "暂无关系图数据，先运行标签抽取与关系聚合任务"} />
        </WorkbenchCard>
      )}
    </DataPanel>
  );
}
