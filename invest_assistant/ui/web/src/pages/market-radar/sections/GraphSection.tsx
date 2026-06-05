import type { EChartsOption } from "echarts";
import { Button, Select } from "antd";
import { FullscreenExitOutlined, FullscreenOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [timeWindow, setTimeWindow] = useState<RankingWindow>("30d");
  const [center, setCenter] = useState<[number, number] | undefined>(undefined);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [windowHeight, setWindowHeight] = useState(typeof window !== "undefined" ? window.innerHeight : 800);
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  const graph = useAsyncData(
    useCallback(() => (type === "track" ? getStockTrackGraph(timeWindow) : getStockHotwordGraph(timeWindow)), [type, timeWindow]),
    { nodes: [], edges: [] }
  );

  // Reset center when type or timeWindow changes
  useEffect(() => {
    setCenter(undefined);
  }, [type, timeWindow]);

  // Handle window resize dynamically in fullscreen mode
  useEffect(() => {
    if (!isFullscreen) return;
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isFullscreen]);

  // Trigger window resize event on fullscreen toggle to let ECharts fit the new container
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 80);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  const chartRef = useRef<any>(null);

  const onEvents = useMemo(() => {
    return {
      click: (params: any) => {
        if (params && params.componentType === "series" && params.seriesType === "graph" && params.dataType === "node") {
          const dataIndex = params.dataIndex;
          if (dataIndex !== undefined) {
            try {
              const chartInstance = chartRef.current?.getEchartsInstance();
              if (chartInstance && typeof chartInstance.getModel === "function") {
                const series = chartInstance.getModel().getSeriesByIndex(0);
                const layout = series?.getData()?.getItemLayout(dataIndex);
                if (layout && Array.isArray(layout) && layout.length >= 2) {
                  const [x, y] = layout;
                  setCenter([x, y]);
                }
              }
            } catch (e) {
              console.error("Failed to get node layout coordinates", e);
            }
          }
        }
      }
    };
  }, []);

  const option = useMemo<EChartsOption>(() => {
    const isDark = resolvedMode === "dark";
    
    // Modern tech-palette colors
    const stockColor = "#2563eb"; 
    const relatedColor = type === "track" 
      ? (isDark ? "#bc8cff" : "#8b5cf6") 
      : (isDark ? "#34d399" : "#10b981");
      
    // 1. Calculate aggregated edge weights for each node to represent its co-occurrence heat
    const nodeWeights = new Map<string, number>();
    graph.data.edges.forEach((edge) => {
      if (edge.stock_tag && edge.related_tag) {
        const stockKey = tagKey(edge.stock_tag);
        const relatedKey = tagKey(edge.related_tag);
        const w = Number(edge.weight || 0);
        nodeWeights.set(stockKey, (nodeWeights.get(stockKey) || 0) + w);
        nodeWeights.set(relatedKey, (nodeWeights.get(relatedKey) || 0) + w);
      }
    });

    // 2. Find min & max weights in current graph
    let maxWeight = 1;
    let minWeight = Infinity;
    nodeWeights.forEach((w) => {
      if (w > maxWeight) maxWeight = w;
      if (w < minWeight) minWeight = w;
    });
    if (minWeight === Infinity) minWeight = 1;

    const data = graph.data.nodes.map((node) => {
      const key = tagKey(node);
      const weight = nodeWeights.get(key) || 0;
      
      // Calculate normalized scale factor [0, 1]
      const range = maxWeight - minWeight;
      const scale = range > 0 ? (weight - minWeight) / range : 0;
      
      // Scale node size dynamically:
      // Stock size ranges from 38 to 68 based on relative heat
      // Track/Hotword size ranges from 28 to 54
      const baseSize = node.type === "stock" ? 38 : 28;
      const maxSize = node.type === "stock" ? 68 : 54;
      const symbolSize = Math.round(baseSize + scale * (maxSize - baseSize));

      const color = node.type === "stock" ? stockColor : relatedColor;

      return {
        id: key,
        name: node.name,
        symbolSize,
        category: node.type === "stock" ? 0 : 1,
        itemStyle: {
          color: color,
          borderWidth: 2,
          borderColor: color,
          shadowBlur: 8,
          shadowColor: node.type === "stock" 
            ? (isDark ? "rgba(37, 99, 235, 0.2)" : "rgba(37, 99, 235, 0.12)")
            : (type === "track"
                ? (isDark ? "rgba(188, 140, 255, 0.2)" : "rgba(139, 92, 246, 0.12)")
                : (isDark ? "rgba(52, 211, 153, 0.2)" : "rgba(16, 185, 129, 0.12)")
              )
        }
      };
    });

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
      legend: {
        data: ["标的", type === "track" ? "赛道" : "市场热词"],
        left: "left",
        top: "top",
        textStyle: { color: isDark ? "#9ca3af" : "#475569" }
      },
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
          center: center,
          force: { repulsion: 350, edgeLength: 120, gravity: 0.15 },
           label: {
            show: true,
            position: "bottom",
            distance: 6,
            color: isDark ? "#cbd5e1" : "#334155",
            fontSize: 11,
            fontWeight: 500
          },
          emphasis: {
            focus: "adjacency",
            lineStyle: {
              width: 5
            },
            itemStyle: {
              shadowBlur: 15,
              shadowColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"
            }
          },
          blur: {
            itemStyle: {
              opacity: 0.15
            },
            lineStyle: {
              opacity: 0.04
            },
            label: {
              opacity: 0.15
            }
          },
          selectedMode: "single",
          select: {
            itemStyle: {
              borderWidth: 4,
              borderColor: isDark ? "#ffffff" : "#1e293b",
              shadowBlur: 16,
              shadowColor: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"
            },
            label: {
              fontWeight: "bold",
              fontSize: 12
            }
          }
        }
      ]
    };
  }, [graph.data, type, resolvedMode, center]);

  return (
    <DataPanel
      toolbar={
        <>
          <Select size="small" value={type} options={graphTypeOptions} style={{ width: 130 }} onChange={setType} />
          <div className="data-panel-toolbar-divider" />
          <Select size="small" value={timeWindow} options={windowOptions} style={{ width: 90 }} onChange={setTimeWindow} />
          <div className="data-panel-toolbar-spacer" />
        </>
      }
    >
      {graph.data.nodes.length ? (
        <div className={isFullscreen ? "graph-fullscreen-overlay" : ""} style={{ position: "relative" }}>
          <Button
            size="small"
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{
              position: "absolute",
              top: isFullscreen ? 40 : 16,
              right: isFullscreen ? 40 : 16,
              zIndex: 10,
              fontSize: "12px",
              height: "28px",
              padding: "0 10px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              borderRadius: "6px",
              background: resolvedMode === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.02)",
              border: resolvedMode === "dark" ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)",
              color: resolvedMode === "dark" ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.65)",
              boxShadow: "none"
            }}
          >
            {isFullscreen ? "退出全屏" : "全屏查看"}
          </Button>
          <ChartCard
            title=""
            option={option}
            height={isFullscreen ? (windowHeight - 80) : 750}
            onEvents={onEvents}
            chartRef={chartRef}
            style={isFullscreen ? { height: "100%", display: "flex", flexDirection: "column", marginBottom: 0 } : undefined}
          />
        </div>
      ) : (
        <WorkbenchCard title="">
          <EmptyAction description={graph.loading ? "加载中" : "暂无关系图数据，先运行标签抽取与关系聚合任务"} />
        </WorkbenchCard>
      )}
    </DataPanel>
  );
}
