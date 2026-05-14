import { Col, Row, Statistic, Table } from "antd";
import { useCallback } from "react";
import { getSystemStatus } from "../../api/console";
import { listJobs } from "../../api/jobs";
import { listReports } from "../../api/reports";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";

export function DashboardPage() {
  const status = useAsyncData(useCallback(getSystemStatus, []), { api: "unknown", database: "unknown" });
  const jobs = useAsyncData(useCallback(listJobs, []), []);
  const reports = useAsyncData(useCallback(listReports, []), []);

  return (
    <>
      <PageHeader title="工作台总览" description="市场、任务、报告和系统状态的统一入口" />
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
            <Statistic title="任务定义" value={jobs.data.length} loading={jobs.loading} />
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="报告数量" value={reports.data.length} loading={reports.loading} />
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
                { title: "启用", dataIndex: "enabled", render: (value: boolean) => (value ? "是" : "否") }
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
                { title: "类型", dataIndex: "report_type" },
                { title: "模块", dataIndex: "source_module" }
              ]}
            />
          </WorkbenchCard>
        </Col>
      </Row>
    </>
  );
}
