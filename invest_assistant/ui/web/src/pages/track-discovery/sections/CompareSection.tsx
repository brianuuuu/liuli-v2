import { Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { listTrackAnalysisSnapshots, listTracks } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { Track, TrackAnalysisSnapshot } from "../../../types/api";
import { stageOptions } from "./shared";

type CompareRow = {
  track: Track;
  snapshot?: TrackAnalysisSnapshot;
};

export function CompareSection() {
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [trackId, setTrackId] = useState<number | undefined>();
  const snapshots = useAsyncData(useCallback(() => (trackId ? listTrackAnalysisSnapshots(trackId) : Promise.resolve([])), [trackId]), []);
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
    { title: "阶段", dataIndex: ["track", "stage"], width: 100, render: (value) => stageOptions.find((item) => item.value === value)?.label || value || "-" },
    { title: "评分", dataIndex: ["track", "track_score"], width: 80, render: (value) => value ?? "-" },
    { title: "置信", dataIndex: ["track", "confidence_level"], width: 90, render: (value) => value || "-" },
    { title: "当前判断", dataIndex: ["track", "current_view"], ellipsis: true, render: (value) => value || "-" },
    { title: "市场空间", dataIndex: ["snapshot", "market_space"], ellipsis: true, render: (value) => value || "-" },
    { title: "当前规模", dataIndex: ["snapshot", "market_size"], ellipsis: true, render: (value) => value || "-" },
    { title: "增长速度", dataIndex: ["snapshot", "growth_rate"], width: 120, render: (value) => value || "-" },
    { title: "机会", dataIndex: ["snapshot", "opportunity_points"], ellipsis: true, render: (value) => value || "-" },
    { title: "风险", dataIndex: ["snapshot", "risk_points"], ellipsis: true, render: (value) => value || "-" }
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
