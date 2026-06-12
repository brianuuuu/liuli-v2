import {
  AlertOutlined,
  FireOutlined,
  StarOutlined,
  TrophyOutlined
} from "@ant-design/icons";
import { Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getTrackDashboard, listTrackAnalysisSnapshots } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type {
  TrackAnalysisSnapshot,
  TrackDashboardAnalysisSummary,
  TrackDashboardFocusTrack,
  TrackDashboardMaterial,
  TrackHeatRanking
} from "../../../types/api";
import { DirectionTag, formatTime, stageOptions, StatusTag } from "./shared";

const confidenceLabel: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高"
};

const materialTypeLabel: Record<string, string> = {
  source_item: "信息流",
  knowledge_note: "笔记"
};

const importanceLabel: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低"
};

function stageLabel(value?: string | null) {
  return stageOptions.find((item) => item.value === value)?.label || value || "-";
}

function rankChangeText(value?: number | null) {
  const next = Number(value || 0);
  if (!next) return "持平";
  return next > 0 ? `↑ ${next}` : `↓ ${Math.abs(next)}`;
}

function rankChangeClass(value?: number | null) {
  const next = Number(value || 0);
  if (next > 0) return "up";
  if (next < 0) return "down";
  return "";
}

function countText(value?: number | null) {
  return Number(value || 0);
}

function snapshotToSummary(trackName: string, snapshot?: TrackAnalysisSnapshot | null): TrackDashboardAnalysisSummary | null {
  if (!snapshot) return null;
  return {
    track_id: snapshot.track_id,
    track_name: trackName,
    analysis_date: snapshot.analysis_date,
    market_space: snapshot.market_space,
    market_size: snapshot.market_size,
    growth_rate: snapshot.growth_rate,
    heat_summary: snapshot.heat_summary,
    opportunity_points: snapshot.opportunity_points,
    risk_points: snapshot.risk_points,
    watch_signals: snapshot.watch_signals,
    score: snapshot.score,
    confidence_level: snapshot.confidence_level
  };
}

export function OverviewSection() {
  const dashboard = useAsyncData(useCallback(getTrackDashboard, []), {
    summary: { warming_tracks_count: 0, focus_tracks_count: 0, pending_materials_count: 0, top_heat_track: null },
    heat_rankings: [],
    focus_tracks: [],
    latest_materials: [],
    default_track_id: null,
    analysis_summary: null
  });
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedTrackId && dashboard.data.default_track_id) {
      setSelectedTrackId(dashboard.data.default_track_id);
    }
  }, [dashboard.data.default_track_id, selectedTrackId]);

  const selectedTrackName = useMemo(() => {
    const ranking = dashboard.data.heat_rankings.find((item) => item.track_id === selectedTrackId);
    const focus = dashboard.data.focus_tracks.find((item) => item.track_id === selectedTrackId);
    return ranking?.track_name || focus?.name || dashboard.data.analysis_summary?.track_name || "-";
  }, [dashboard.data, selectedTrackId]);

  const selectedSnapshots = useAsyncData(
    useCallback(async () => {
      if (!selectedTrackId) return [];
      return listTrackAnalysisSnapshots(selectedTrackId);
    }, [selectedTrackId]),
    [] as TrackAnalysisSnapshot[]
  );

  const selectedAnalysis = useMemo(() => {
    if (selectedTrackId && selectedTrackId === dashboard.data.analysis_summary?.track_id) {
      return dashboard.data.analysis_summary;
    }
    return snapshotToSummary(selectedTrackName, selectedSnapshots.data[0]);
  }, [dashboard.data.analysis_summary, selectedSnapshots.data, selectedTrackId, selectedTrackName]);

  const rankingColumns: ColumnsType<TrackHeatRanking> = [
    { title: "排名", dataIndex: "rank", width: 54 },
    { title: "赛道", dataIndex: "track_name", width: 300, ellipsis: true },
    { title: "状态", dataIndex: "status", width: 76, render: (value) => <StatusTag status={value} /> },
    { title: "信息流", dataIndex: "current_heat", width: 68, render: (value) => Number(value || 0).toFixed(0) },
    { title: "材料", dataIndex: "today_material_count", width: 56, render: countText },
    { title: "确认", dataIndex: "confirmed_material_count", width: 56, render: countText },
    { title: "已处理", dataIndex: "processed_material_count", width: 64, render: countText },
    { title: "待处理", dataIndex: "pending_material_count", width: 64, render: countText },
    { title: "24h", dataIndex: "rank_change_24h", width: 70, render: (value) => <span className={`track-change ${rankChangeClass(value)}`}>{rankChangeText(value)}</span> },
    { title: "7日", dataIndex: "rank_change_7d", width: 70, render: (value) => <span className={`track-change ${rankChangeClass(value)}`}>{rankChangeText(value)}</span> },
    { title: "30日", dataIndex: "rank_change_30d", width: 70, render: (value) => <span className={`track-change ${rankChangeClass(value)}`}>{rankChangeText(value)}</span> },
    { title: "阶段", dataIndex: "stage", width: 76, render: (value) => <Tag>{stageLabel(value)}</Tag> },
    { title: "评分", dataIndex: "track_score", width: 56, render: (value) => value ?? "-" }
  ];

  const materialColumns: ColumnsType<TrackDashboardMaterial> = [
    { title: "时间", dataIndex: "material_time", width: 92, render: (_, record) => formatTime(record.material_time || record.created_at).slice(5, 16) },
    { title: "赛道", dataIndex: "track_name", width: 92, ellipsis: true },
    { title: "材料类型", dataIndex: "material_type", width: 78, render: (value) => materialTypeLabel[value] || value || "-" },
    { title: "方向", dataIndex: "direction", width: 70, render: (value) => <DirectionTag direction={value} /> },
    { title: "摘要", dataIndex: "material_summary", ellipsis: true, render: (_, record) => record.material_summary || record.material_title || record.note || "-" },
    { title: "重要性", dataIndex: "importance_level", width: 70, render: (value) => <Tag>{importanceLabel[value] || value || "-"}</Tag> }
  ];

  return (
    <div className="track-dashboard">
      <div className="track-dashboard-metrics">
        <MetricCard icon={<FireOutlined />} label="7日升温赛道数量" value={dashboard.data.summary.warming_tracks_count} />
        <MetricCard icon={<StarOutlined />} label="重点跟踪赛道数量" value={dashboard.data.summary.focus_tracks_count} />
        <MetricCard icon={<AlertOutlined />} label="待确认动态数量" value={dashboard.data.summary.pending_materials_count} />
        <MetricCard
          icon={<TrophyOutlined />}
          label="今日最高热度赛道"
          value={dashboard.data.summary.top_heat_track?.name || "-"}
        />
      </div>

      <div className="track-dashboard-ranking-card">
        <WorkbenchCard title="今日赛道简表">
          <Table
            rowKey="track_id"
            size="small"
            loading={dashboard.loading}
            dataSource={dashboard.data.heat_rankings.slice(0, 10)}
            columns={rankingColumns}
            pagination={false}
            rowClassName={(record) => (record.track_id === selectedTrackId ? "selected-dashboard-row" : "")}
            onRow={(record) => ({ onClick: () => setSelectedTrackId(record.track_id) })}
            locale={{ emptyText: <EmptyAction description="暂无赛道热度数据" /> }}
          />
        </WorkbenchCard>
      </div>

      <WorkbenchCard title="最新赛道动态">
        <Table
          rowKey="id"
          size="small"
          loading={dashboard.loading}
          dataSource={dashboard.data.latest_materials}
          columns={materialColumns}
          pagination={false}
          locale={{ emptyText: <EmptyAction description="暂无赛道动态" /> }}
        />
      </WorkbenchCard>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="track-metric-card">
      <div className="track-metric-icon">{icon}</div>
      <div className="track-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
