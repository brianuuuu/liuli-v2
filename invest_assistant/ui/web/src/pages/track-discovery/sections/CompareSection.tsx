import { Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { listTrackTrendSnapshots, listTracks } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { Track, TrackTrendSnapshot } from "../../../types/api";
import { industryPhaseLabel, marketPhaseLabel, StrengthCycleTag, researchPriorityLabel, strengthLabel } from "./shared";

type CompareRow = {
  track: Track;
  snapshot?: TrackTrendSnapshot;
};

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
      title: "主判断",
      key: "headline",
      width: 110,
      render: (_, record) => <StrengthCycleTag strength={record.snapshot?.headline_strength} cycle={record.snapshot?.headline_cycle} />
    },
    { title: "优先级", dataIndex: ["snapshot", "research_priority"], width: 100, render: (value) => researchPriorityLabel(value) },
    { title: "短期", dataIndex: ["snapshot", "short_strength"], width: 80, render: (value) => strengthLabel(value) },
    { title: "中期", dataIndex: ["snapshot", "mid_strength"], width: 80, render: (value) => strengthLabel(value) },
    { title: "长期", dataIndex: ["snapshot", "long_strength"], width: 80, render: (value) => strengthLabel(value) },
    { title: "产业阶段", dataIndex: ["track", "industry_phase"], width: 100, render: (value) => industryPhaseLabel(value) },
    { title: "市场阶段", dataIndex: ["track", "market_phase"], width: 100, render: (value) => marketPhaseLabel(value) },
    { title: "置信", dataIndex: ["track", "confidence_level"], width: 90, render: (value) => value || "-" },
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
