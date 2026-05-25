import { Col, Row, Statistic, Table } from "antd";
import { useCallback } from "react";
import { getDashboard, getSystemStatus } from "../../api/console";
import { listAlertEvents } from "../../api/alerts";
import { listJobs } from "../../api/jobs";
import { listReports } from "../../api/reports";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";

function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

export function DashboardPage() {
  const status = useAsyncData(useCallback(getSystemStatus, []), { api: "unknown", database: "unknown" });
  const dashboard = useAsyncData(useCallback(getDashboard, []), { status: "unknown", todo_events: [] });
  const alertEvents = useAsyncData(useCallback(listAlertEvents, []), []);
  const jobs = useAsyncData(useCallback(listJobs, []), []);
  const reports = useAsyncData(useCallback(listReports, []), []);
  const todoEvents = dashboard.data.todo_events.length
    ? dashboard.data.todo_events
    : alertEvents.data.filter((event) => event.status !== "handled").slice(0, 6);

  return (
    <>
      <PageHeader title="工作台总览" description="市场 / 任务 / 报告 / 系统" />
      <Row gutter={[12, 12]}>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="API" value={status.data.api} loading={status.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="数据库" value={status.data.database} loading={status.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="启用周期任务" value={jobs.data.filter((job: any) => job.config_json?.enabled === true && job.config_json?.execution_mode === "schedule").length} loading={jobs.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="待办事件" value={todoEvents.length} loading={dashboard.loading || alertEvents.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={12}>
          <WorkbenchCard title="待办事件">
            <Table
              rowKey="id"
              size="small"
              loading={dashboard.loading || alertEvents.loading}
              dataSource={todoEvents}
              pagination={false}
              columns={[
                { title: "事件", dataIndex: "title" },
                { title: "级别", dataIndex: "event_level", width: 80 },
                { title: "状态", dataIndex: "status", width: 90 },
                { title: "时间", width: 160, render: (_, record: any) => formatTime(record.event_time || record.created_at) }
              ]}
            />
          </WorkbenchCard>
        </Col>
        <Col span={12}>
          <WorkbenchCard title="最近任务">
            <Table
              rowKey="job_name"
              size="small"
              loading={jobs.loading}
              dataSource={jobs.data.slice(0, 6)}
              pagination={false}
              columns={[
                { title: "任务", dataIndex: "job_name" },
                { title: "模块", dataIndex: "module_name" },
                { title: "启用", dataIndex: "config_json", width: 70, render: (config: any) => (config?.enabled === true ? "是" : "否") },
                { title: "最近运行", width: 160, render: (_, record: any) => formatTime(record.last_run_at || record.updated_at) }
              ]}
            />
          </WorkbenchCard>
        </Col>
        <Col span={12}>
          <WorkbenchCard title="最近报告">
            <Table
              rowKey="id"
              size="small"
              loading={reports.loading}
              dataSource={reports.data.slice(0, 6)}
              pagination={false}
              columns={[
                { title: "标题", dataIndex: "title" },
                { title: "类型", dataIndex: "report_type", width: 120 },
                { title: "模块", dataIndex: "source_module", width: 120 },
                { title: "创建时间", width: 160, render: (_, record: any) => formatTime(record.created_at || record.publish_time) }
              ]}
            />
          </WorkbenchCard>
        </Col>
      </Row>
    </>
  );
}
