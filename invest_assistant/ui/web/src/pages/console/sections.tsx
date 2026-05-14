import { Button, Col, Row, Space, Statistic, Table, message } from "antd";
import { useCallback } from "react";
import { getAiLogs, getDashboard, getDataSources, getSystemStatus } from "../../api/console";
import { fetchDisclosures, listDisclosures } from "../../api/disclosures";
import { listJobs, runJob, syncJobDefinitions } from "../../api/jobs";
import { listReports } from "../../api/reports";
import { listStocks } from "../../api/stocks";
import { listSystemConfigs } from "../../api/systemConfig";
import { RecordTable } from "../../components/common/RecordTable";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";

const genericColumns = [
  { title: "名称", dataIndex: "name" },
  { title: "标题", dataIndex: "title" },
  { title: "类型", dataIndex: "type" },
  { title: "状态", dataIndex: "status" }
];

function StatusSection() {
  const status = useAsyncData(useCallback(getSystemStatus, []), { api: "unknown", database: "unknown" });
  const dashboard = useAsyncData(useCallback(getDashboard, []), {});
  const dataSources = useAsyncData(useCallback(getDataSources, []), []);
  return (
    <Row gutter={[12, 12]}>
      <Col span={6}><WorkbenchCard><Statistic title="API" value={status.data.api} loading={status.loading} /></WorkbenchCard></Col>
      <Col span={6}><WorkbenchCard><Statistic title="数据库" value={status.data.database} loading={status.loading} /></WorkbenchCard></Col>
      <Col span={6}><WorkbenchCard><Statistic title="控制台状态" value={dashboard.data.status || "unknown"} loading={dashboard.loading} /></WorkbenchCard></Col>
      <Col span={6}><WorkbenchCard><Statistic title="数据源" value={dataSources.data.length} loading={dataSources.loading} /></WorkbenchCard></Col>
    </Row>
  );
}

function JobsSection() {
  const jobs = useAsyncData(useCallback(listJobs, []), []);

  async function sync() {
    const result = await syncJobDefinitions();
    message.success(`已同步 ${result.synced} 个任务定义`);
    await jobs.refresh();
  }

  async function run(jobName: string) {
    await runJob(jobName);
    message.success("已提交运行请求");
    await jobs.refresh();
  }

  return (
    <WorkbenchCard
      title="任务中心"
      extra={<Button onClick={sync}>同步任务定义</Button>}
    >
      <Table
        rowKey="job_name"
        size="small"
        loading={jobs.loading}
        dataSource={jobs.data}
        columns={[
          { title: "任务", dataIndex: "job_name" },
          { title: "模块", dataIndex: "module_name" },
          { title: "启用", dataIndex: "enabled", render: (value: boolean) => (value ? "是" : "否") },
          {
            title: "操作",
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => run(record.job_name)}>
                  立即运行
                </Button>
              </Space>
            )
          }
        ]}
      />
    </WorkbenchCard>
  );
}

export function ConsoleSections({ activeTab }: { activeTab: string }) {
  const reports = useAsyncData(useCallback(listReports, []), []);
  const disclosures = useAsyncData(useCallback(listDisclosures, []), []);
  const stocks = useAsyncData(useCallback(listStocks, []), []);
  const configs = useAsyncData(useCallback(listSystemConfigs, []), []);
  const aiLogs = useAsyncData(useCallback(getAiLogs, []), []);

  if (activeTab === "status") return <StatusSection />;
  if (activeTab === "jobs") return <JobsSection />;
  if (activeTab === "reports") return <RecordTable loading={reports.loading} data={reports.data as unknown as Record<string, unknown>[]} columns={genericColumns} emptyText="暂无报告" drawerTitle="报告详情" />;
  if (activeTab === "disclosures") {
    return (
      <WorkbenchCard title="公告财报库" extra={<Button onClick={() => fetchDisclosures().then(() => message.success("已提交拉取请求"))}>拉取公告</Button>}>
        <RecordTable loading={disclosures.loading} data={disclosures.data as unknown as Record<string, unknown>[]} columns={genericColumns} emptyText="暂无公告财报" drawerTitle="公告财报详情" />
      </WorkbenchCard>
    );
  }
  if (activeTab === "stocks") return <RecordTable loading={stocks.loading} data={stocks.data as unknown as Record<string, unknown>[]} columns={genericColumns} emptyText="暂无股票基础数据" drawerTitle="股票详情" />;
  if (activeTab === "config") return <RecordTable loading={configs.loading} data={configs.data} columns={genericColumns} emptyText="暂无系统配置" drawerTitle="配置详情" />;
  return <RecordTable loading={aiLogs.loading} data={aiLogs.data} columns={genericColumns} emptyText="暂无 AI 调用日志" drawerTitle="AI 日志详情" />;
}
