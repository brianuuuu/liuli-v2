import type { EChartsOption } from "echarts";
import { useCallback } from "react";
import { listMarketTags, listRankings, listSourceItems, listTagCandidates } from "../../api/marketRadar";
import { ChartCard } from "../../components/charts/ChartCard";
import { EmptyAction } from "../../components/common/EmptyAction";
import { RecordTable } from "../../components/common/RecordTable";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";

const basicColumns = [
  { title: "名称", dataIndex: "name" },
  { title: "类型", dataIndex: "type" },
  { title: "状态", dataIndex: "status" },
  { title: "时间", dataIndex: "created_at" }
];

function OverviewSection() {
  const rankings = useAsyncData(useCallback(() => listRankings("hotword"), []), []);
  if (!rankings.loading && rankings.data.length === 0) {
    return (
      <WorkbenchCard title="热度榜概览">
        <EmptyAction description="暂无热度数据，去控制台同步或运行市场雷达任务" />
      </WorkbenchCard>
    );
  }
  const option: EChartsOption = {
    tooltip: {},
    grid: { left: 36, right: 16, top: 24, bottom: 28 },
    xAxis: { type: "category", data: rankings.data.slice(0, 8).map((item) => String(item.name ?? item.keyword ?? item.tag_name ?? "-")) },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: rankings.data.slice(0, 8).map((item) => Number(item.score ?? item.heat ?? item.count ?? 0)) }]
  };
  return <ChartCard title="热度榜概览" option={option} />;
}

function RankingsSection() {
  const rankings = useAsyncData(useCallback(() => listRankings("stock"), []), []);
  return <RecordTable loading={rankings.loading} data={rankings.data} columns={basicColumns} emptyText="暂无热度榜数据" drawerTitle="热度详情" />;
}

function SourcesSection() {
  const sources = useAsyncData(useCallback(listSourceItems, []), []);
  return <RecordTable loading={sources.loading} data={sources.data} columns={basicColumns} emptyText="暂无信息源，去控制台触发采集任务" drawerTitle="信息源详情" />;
}

function TagsSection() {
  const tags = useAsyncData(useCallback(listMarketTags, []), []);
  return <RecordTable loading={tags.loading} data={tags.data} columns={basicColumns} emptyText="暂无标签" drawerTitle="标签详情" />;
}

function CandidatesSection() {
  const candidates = useAsyncData(useCallback(listTagCandidates, []), []);
  return <RecordTable loading={candidates.loading} data={candidates.data} columns={basicColumns} emptyText="暂无候选标签" drawerTitle="候选标签详情" />;
}

function GraphSection() {
  const option: EChartsOption = {
    tooltip: {},
    series: [
      {
        type: "graph",
        layout: "force",
        roam: true,
        data: [
          { name: "市场热点", symbolSize: 56 },
          { name: "赛道", symbolSize: 42 },
          { name: "标的", symbolSize: 36 }
        ],
        links: [
          { source: "市场热点", target: "赛道" },
          { source: "赛道", target: "标的" }
        ],
        force: { repulsion: 160 }
      }
    ]
  };
  return <ChartCard title="标的-赛道关系图" option={option} height={360} />;
}

export function MarketRadarSections({ activeTab }: { activeTab: string }) {
  if (activeTab === "overview") return <OverviewSection />;
  if (activeTab === "rankings") return <RankingsSection />;
  if (activeTab === "sources") return <SourcesSection />;
  if (activeTab === "tags") return <TagsSection />;
  if (activeTab === "candidates") return <CandidatesSection />;
  if (activeTab === "graph") return <GraphSection />;
  return <WorkbenchCard>未知页面</WorkbenchCard>;
}
