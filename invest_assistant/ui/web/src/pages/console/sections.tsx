import { useCallback, useState } from "react";
import { getAiLogs } from "../../api/console";
import { RecordTable } from "../../components/common/RecordTable";
import { useAsyncData } from "../../hooks/useAsyncData";
import { DisclosuresSection } from "./sections/DisclosuresSection";
import { DataSourcesSection } from "./sections/DataSourcesSection";
import { JobsSection } from "./sections/JobsSection";
import { ReportsSection } from "./sections/ReportsSection";
import { StatusSection } from "./sections/StatusSection";
import { StocksSection } from "./sections/StocksSection";
import { SystemConfigSection } from "./sections/SystemConfigSection";
import { TagsSection } from "./sections/TagsSection";

const logColumns = [
  { title: "时间", dataIndex: "created_at" },
  { title: "相关任务", dataIndex: "task_name" },
  { title: "服务商", dataIndex: "provider" },
  { title: "模型", dataIndex: "model" },
  { title: "状态", dataIndex: "status" },
  { title: "Token", dataIndex: "total_tokens" },
  { title: "耗时(ms)", dataIndex: "duration_ms" }
];

function AiLogsSection() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const aiLogs = useAsyncData(
    useCallback(() => getAiLogs({ limit: pageSize, offset: (page - 1) * pageSize }), [page, pageSize]),
    { items: [], total: 0, limit: pageSize, offset: 0, has_more: false }
  );
  return (
    <RecordTable
      loading={aiLogs.loading}
      data={aiLogs.data.items}
      columns={logColumns}
      emptyText="暂无 AI 调用日志"
      drawerTitle="AI 日志详情"
      pagination={{
        current: page,
        pageSize,
        total: aiLogs.data.total,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`
      }}
      onChange={(pagination) => {
        setPage(pagination.current || 1);
        setPageSize(pagination.pageSize || 50);
      }}
    />
  );
}

export function ConsoleSections({ activeTab }: { activeTab: string }) {
  if (activeTab === "status") return <StatusSection />;
  if (activeTab === "jobs") return <JobsSection />;
  if (activeTab === "data-sources") return <DataSourcesSection />;
  if (activeTab === "tags") return <TagsSection />;
  if (activeTab === "reports") return <ReportsSection />;
  if (activeTab === "disclosures") return <DisclosuresSection />;
  if (activeTab === "stocks") return <StocksSection />;
  if (activeTab === "config") return <SystemConfigSection />;
  return <AiLogsSection />;
}
