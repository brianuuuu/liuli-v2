import { useCallback } from "react";
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
  { title: "名称", dataIndex: "name" },
  { title: "标题", dataIndex: "title" },
  { title: "类型", dataIndex: "type" },
  { title: "状态", dataIndex: "status" }
];

function AiLogsSection() {
  const aiLogs = useAsyncData(useCallback(getAiLogs, []), []);
  return (
    <RecordTable
      loading={aiLogs.loading}
      data={aiLogs.data}
      columns={logColumns}
      emptyText="暂无 AI 调用日志"
      drawerTitle="AI 日志详情"
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
