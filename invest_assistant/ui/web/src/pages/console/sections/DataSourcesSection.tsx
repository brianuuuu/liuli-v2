import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback } from "react";
import { getDataSources } from "../../../api/console";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { DataSourceStatus } from "../../../types/api";
import { formatTime } from "./shared";

const columns: ColumnsType<DataSourceStatus> = [
  { title: "数据源", dataIndex: "name", width: 180 },
  { title: "模块", dataIndex: "module", width: 180 },
  { title: "接口", dataIndex: "provider", width: 180 },
  { title: "记录数", dataIndex: "record_count", width: 120 },
  {
    title: "状态",
    dataIndex: "status",
    width: 120,
    render: (value) => <Tag color={value === "success" ? "green" : value === "failed" ? "red" : "default"}>{value || "unknown"}</Tag>
  },
  { title: "最近同步", dataIndex: "last_sync_at", render: formatTime }
];

export function DataSourcesSection() {
  const dataSources = useAsyncData(useCallback(getDataSources, []), []);

  return (
    <DataPanel>
      <Table rowKey="key" size="small" loading={dataSources.loading} dataSource={dataSources.data} columns={columns} pagination={false} />
    </DataPanel>
  );
}
