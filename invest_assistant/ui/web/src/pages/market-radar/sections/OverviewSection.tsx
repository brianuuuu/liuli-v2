import { Button, Col, Row, Space, Statistic } from "antd";
import { useCallback, useState } from "react";
import { getMarketOverview, listAiTagSuggestions, listRankings } from "../../../api/marketRadar";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TagHeat } from "../../../types/api";
import { formatTime, tagName } from "./shared";
import {
  coolingTopRows,
  formatRisePercent,
  riseClass,
  risingTopRows,
  risingTypes,
  risingWindows,
  type RisingRankingType,
  type RisingRankingWindow
} from "./overviewRisingRankings";

type RisingRankingGroup = {
  type: RisingRankingType;
  rows: TagHeat[];
};

type HeatMovementBoardProps = {
  title: string;
  activeWindow: RisingRankingWindow;
  rowsByType: Map<RisingRankingType, TagHeat[]>;
  loading: boolean;
  emptyDescription: string;
  onWindowChange: (value: RisingRankingWindow) => void;
};

function HeatMovementBoard({ title, activeWindow, rowsByType, loading, emptyDescription, onWindowChange }: HeatMovementBoardProps) {
  return (
    <WorkbenchCard
      title={title}
      extra={
        <Space size={4} className="toolbar-status-buttons heat-board-segmented">
          {risingWindows.map((item) => (
            <Button
              key={item.value}
              size="small"
              className={activeWindow === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
              onClick={() => onWindowChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </Space>
      }
    >
      <div className="market-rising-card-body">
        {risingTypes.map((type) => (
          <RisingRankingList
            key={type.value}
            title={type.label}
            rows={rowsByType.get(type.value) || []}
            loading={loading}
            emptyDescription={emptyDescription}
          />
        ))}
      </div>
    </WorkbenchCard>
  );
}

function RisingRankingList({
  title,
  rows,
  loading,
  emptyDescription
}: {
  title: string;
  rows: TagHeat[];
  loading: boolean;
  emptyDescription: string;
}) {
  return (
    <div className="market-rising-list">
      <div className="market-rising-list-title">{title}</div>
      {rows.length ? (
        <div className="compact-list market-rising-list-rows">
          {rows.map((item, index) => (
            <div className="compact-list-row" key={item.id}>
              <span className="market-rising-row-label">
                <span className="market-rising-rank-no">{index + 1}</span>
                <span className="market-rising-name">{tagName(item)}</span>
              </span>
              <strong className={`track-change ${riseClass(item.change_ratio)}`}>{formatRisePercent(item.change_ratio)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <EmptyAction description={loading ? "加载中" : emptyDescription} />
      )}
    </div>
  );
}

export function OverviewSection() {
  const [activeRisingWindow, setActiveRisingWindow] = useState<RisingRankingWindow>("7d");
  const [activeCoolingWindow, setActiveCoolingWindow] = useState<RisingRankingWindow>("7d");
  const overview = useAsyncData(useCallback(getMarketOverview, []), { source_items: 0, tags: 0, active_tags: 0, ai_tag_suggestions: 0 });
  const risingRankings = useAsyncData(
    useCallback(async () => {
      const groups = await Promise.all(
        risingTypes.map(async (type) => ({
          type: type.value,
          rows: risingTopRows(await listRankings(type.value, activeRisingWindow))
        }))
      );
      return groups;
    }, [activeRisingWindow]),
    [] as RisingRankingGroup[]
  );
  const coolingRankings = useAsyncData(
    useCallback(async () => {
      const groups = await Promise.all(
        risingTypes.map(async (type) => ({
          type: type.value,
          rows: coolingTopRows(await listRankings(type.value, activeCoolingWindow))
        }))
      );
      return groups;
    }, [activeCoolingWindow]),
    [] as RisingRankingGroup[]
  );
  const pendingSuggestions = useAsyncData(useCallback(() => listAiTagSuggestions("pending", { limit: 1, offset: 0 }), []), {
    items: [],
    total: 0,
    limit: 1,
    offset: 0,
    has_more: false
  });

  const risingGroupByType = new Map(risingRankings.data.map((item) => [item.type, item.rows]));
  const coolingGroupByType = new Map(coolingRankings.data.map((item) => [item.type, item.rows]));
  const latestStat = [...risingRankings.data, ...coolingRankings.data].flatMap((item) => item.rows).map((item) => item.stat_time).sort().at(-1);
  const activeTagCount = overview.data.active_tags;
  const pendingSuggestionCount = pendingSuggestions.data.total || overview.data.ai_tag_suggestions;

  return (
    <div className="market-overview-dashboard">
      <Row gutter={[10, 10]} className="metric-grid-row">
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="市场信号" value={overview.data.source_items} loading={overview.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="活跃标签" value={activeTagCount} loading={overview.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="AI 推荐词" value={pendingSuggestionCount} loading={pendingSuggestions.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="最新统计" value={formatTime(latestStat).slice(5) || "-"} loading={risingRankings.loading || coolingRankings.loading} />
          </WorkbenchCard>
        </Col>
      </Row>

      <div className="market-overview-grid">
        <HeatMovementBoard
          title="热度升温榜"
          activeWindow={activeRisingWindow}
          rowsByType={risingGroupByType}
          loading={risingRankings.loading}
          emptyDescription="暂无升温数据"
          onWindowChange={setActiveRisingWindow}
        />
        <HeatMovementBoard
          title="热度降温榜"
          activeWindow={activeCoolingWindow}
          rowsByType={coolingGroupByType}
          loading={coolingRankings.loading}
          emptyDescription="暂无降温数据"
          onWindowChange={setActiveCoolingWindow}
        />
      </div>
    </div>
  );
}
