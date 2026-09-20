import { Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { listTrackTrendSnapshots, listTracks } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { Track, TrackTrendSnapshot } from "../../../types/api";
import { industryPhaseLabel, marketPhaseLabel, TrackGradeTags } from "./shared";

type CompareRow = {
  track: Track;
  snapshot?: TrackTrendSnapshot;
};

/** 没选具体赛道时只有列表项，拿不到六维明细，显示占位而不是 0。 */
function scoreText(value?: number | null) {
  return typeof value === "number" ? value.toFixed(1) : "-";
}

export function CompareSection() {
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [trackId, setTrackId] = useState<number | undefined>();
  const snapshots = useAsyncData(useCallback(() => (trackId ? listTrackTrendSnapshots(trackId) : Promise.resolve([])), [trackId]), []);
  const trackOptions = useMemo(() => tracks.data.map((item) => ({ value: item.id, label: item.name })), [tracks.data]);
  const rows = useMemo<CompareRow[]>(() => {
    if (trackId) {
      const track = tracks.data.find((item) => item.id === trackId);
      return track ? [{ track, snapshot: snapshots.data[0] }] : [];
    }
    return tracks.data.map((track) => ({ track }));
  }, [snapshots.data, trackId, tracks.data]);

  const columns: ColumnsType<CompareRow> = [
    { title: "赛道", dataIndex: ["track", "name"], fixed: "left", width: 160 },
    { title: "状态", dataIndex: ["track", "status"], width: 90 },
    {
      title: "评级",
      key: "grade",
      width: 130,
      render: (_, record) => (
        <TrackGradeTags
          grade={record.snapshot?.track_grade ?? record.track.track_grade}
          tier={record.snapshot?.heat_tier ?? record.track.heat_tier}
          score={record.snapshot?.overall_score ?? record.track.overall_score}
        />
      )
    },
    // 六维分数单列展示，对比页的用处就是横着看哪一维拉开了差距。
    { title: "热度", dataIndex: ["snapshot", "market_heat_score"], width: 72, render: scoreText },
    { title: "速度", dataIndex: ["snapshot", "growth_speed_score"], width: 72, render: scoreText },
    { title: "集中度", dataIndex: ["snapshot", "concentration_score"], width: 78, render: scoreText },
    { title: "周期韧性", dataIndex: ["snapshot", "cycle_resilience_score"], width: 86, render: scoreText },
    { title: "当前规模", dataIndex: ["snapshot", "current_market_size_score"], width: 86, render: scoreText },
    { title: "远期规模", dataIndex: ["snapshot", "future_market_size_score"], width: 86, render: scoreText },
    { title: "产业阶段", dataIndex: ["track", "industry_phase"], width: 100, render: (value) => industryPhaseLabel(value) },
    { title: "市场阶段", dataIndex: ["track", "market_phase"], width: 100, render: (value) => marketPhaseLabel(value) },
    { title: "核心判断", dataIndex: ["snapshot", "core_judgment"], ellipsis: true, render: (value, record) => value || record.track.current_view || "-" },
    { title: "主要矛盾", dataIndex: ["snapshot", "key_contradiction"], ellipsis: true, render: (value) => value || "-" },
    { title: "风险与证伪", dataIndex: ["snapshot", "risk_falsification"], ellipsis: true, render: (value) => value || "-" }
  ];

  return (
    <DataPanel
      toolbar={
        <>
          <Space>
            <Select allowClear showSearch size="small" placeholder="选择赛道查看快照" value={trackId} options={trackOptions} loading={tracks.loading} style={{ width: 260 }} onChange={setTrackId} />
          </Space>
          <div className="data-panel-toolbar-spacer" />
        </>
      }
    >
      <Table
        rowKey={(record) => `${record.track.id}-${record.snapshot?.id || "current"}`}
        size="small"
        loading={tracks.loading || snapshots.loading}
        dataSource={rows}
        columns={columns}
        pagination={{ defaultPageSize: 10 }}
        scroll={{ x: 1200 }}
        locale={{ emptyText: <EmptyAction description="暂无赛道对比数据" /> }}
      />
    </DataPanel>
  );
}
