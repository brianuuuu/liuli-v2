import { Col, Row, Space, Statistic } from "antd";
import { useCallback } from "react";
import { getMarketOverview, listMarketTags, listRankings, listSourceItems, listTagCandidates } from "../../../api/marketRadar";
import { ChartCard } from "../../../components/charts/ChartCard";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { formatTime, heatBarOption, tagName } from "./shared";

function RankingList({ title, rows, loading }: { title: string; rows: Awaited<ReturnType<typeof listRankings>>; loading: boolean }) {
  return (
    <WorkbenchCard title={title}>
      {rows.length ? (
        <div className="compact-list">
          {rows.slice(0, 8).map((item) => (
            <div className="compact-list-row" key={item.id}>
              <span>{item.rank_no}. {tagName(item)}</span>
              <strong>{Number(item.heat_score || 0).toFixed(1)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <EmptyAction description={loading ? "加载中" : "暂无热度数据"} />
      )}
    </WorkbenchCard>
  );
}

export function OverviewSection() {
  const overview = useAsyncData(useCallback(getMarketOverview, []), { source_items: 0, tags: 0, tag_candidates: 0 });
  const hotwords = useAsyncData(useCallback(() => listRankings("hotword", "24h"), []), []);
  const tracks = useAsyncData(useCallback(() => listRankings("track", "24h"), []), []);
  const stocks = useAsyncData(useCallback(() => listRankings("stock", "24h"), []), []);
  const sources = useAsyncData(useCallback(listSourceItems, []), []);
  const tags = useAsyncData(useCallback(listMarketTags, []), []);
  const candidates = useAsyncData(useCallback(listTagCandidates, []), []);

  const allRankings = [...hotwords.data, ...tracks.data, ...stocks.data].sort((a, b) => Number(b.heat_score) - Number(a.heat_score));
  const latestStat = allRankings.map((item) => item.stat_time).sort().at(-1);
  const activeTagCount = tags.data.filter((item) => item.status === "active").length || overview.data.tags;
  const pendingCandidateCount = candidates.data.filter((item) => item.status === "pending").length || overview.data.tag_candidates;

  return (
    <>
      <Row gutter={[10, 10]} className="metric-grid-row">
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="市场信号" value={overview.data.source_items || sources.data.length} loading={overview.loading || sources.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="活跃标签" value={activeTagCount} loading={tags.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="候选热点" value={pendingCandidateCount} loading={candidates.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="最新统计" value={formatTime(latestStat).slice(5) || "-"} loading={hotwords.loading || tracks.loading || stocks.loading} />
          </WorkbenchCard>
        </Col>
      </Row>

      <div className="market-overview-grid">
        {allRankings.length ? (
          <ChartCard title="24h 热度排行" option={heatBarOption(allRankings)} height={330} />
        ) : (
          <WorkbenchCard title="24h 热度排行">
            <EmptyAction description="暂无热度数据，去控制台运行市场雷达任务" />
          </WorkbenchCard>
        )}
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <RankingList title="热点词" rows={hotwords.data} loading={hotwords.loading} />
          <RankingList title="赛道" rows={tracks.data} loading={tracks.loading} />
          <RankingList title="标的" rows={stocks.data} loading={stocks.loading} />
        </Space>
      </div>
    </>
  );
}
