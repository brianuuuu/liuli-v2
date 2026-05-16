import type { EChartsOption } from "echarts";
import { Select, Space } from "antd";
import { useCallback, useMemo, useState } from "react";
import { getStockHotwordGraph, getStockTrackGraph, type GraphType, type RankingWindow } from "../../../api/marketRadar";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { ChartCard } from "../../../components/charts/ChartCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { tagKey, windowOptions } from "./shared";

const graphTypeOptions = [
  { value: "track", label: "标的-赛道" },
  { value: "hotword", label: "标的-热点词" }
];

export function GraphSection() {
  const [type, setType] = useState<GraphType>("track");
  const [window, setWindow] = useState<RankingWindow>("24h");
  const graph = useAsyncData(
    useCallback(() => (type === "track" ? getStockTrackGraph(window) : getStockHotwordGraph(window)), [type, window]),
    { nodes: [], edges: [] }
  );

  const option = useMemo<EChartsOption>(() => {
    const data = graph.data.nodes.map((node) => ({
      id: tagKey(node),
      name: node.name,
      value: node.type,
      symbolSize: node.type === "stock" ? 42 : 34,
      category: node.type === "stock" ? 0 : 1
    }));
    const links = graph.data.edges
      .filter((edge) => edge.stock_tag && edge.related_tag)
      .map((edge) => ({
        source: tagKey(edge.stock_tag!),
        target: tagKey(edge.related_tag!),
        value: edge.weight,
        lineStyle: { width: Math.max(1, Math.min(6, Number(edge.weight || 1))) }
      }));
    return {
      tooltip: {},
      legend: [{ data: ["标的", type === "track" ? "赛道" : "热点词"] }],
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          categories: [{ name: "标的" }, { name: type === "track" ? "赛道" : "热点词" }],
          data,
          links,
          force: { repulsion: 180, edgeLength: 90 },
          label: { show: true, fontSize: 11 }
        }
      ]
    };
  }, [graph.data, type]);

  return (
    <>
      {graph.data.nodes.length ? (
        <ChartCard
          title="标的关系图"
          option={option}
          height={420}
          extra={
            <Space>
              <Select size="small" value={type} options={graphTypeOptions} style={{ width: 130 }} onChange={setType} />
              <Select size="small" value={window} options={windowOptions} style={{ width: 90 }} onChange={setWindow} />
            </Space>
          }
        />
      ) : (
        <WorkbenchCard
          title="标的关系图"
          extra={
            <Space>
              <Select size="small" value={type} options={graphTypeOptions} style={{ width: 130 }} onChange={setType} />
              <Select size="small" value={window} options={windowOptions} style={{ width: 90 }} onChange={setWindow} />
            </Space>
          }
        >
          <EmptyAction description={graph.loading ? "加载中" : "暂无关系图数据，先运行标签抽取与关系聚合任务"} />
        </WorkbenchCard>
      )}
    </>
  );
}
