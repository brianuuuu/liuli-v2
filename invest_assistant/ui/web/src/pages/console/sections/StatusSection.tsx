import { Col, Row, Statistic } from "antd";
import { useCallback } from "react";
import { getAiLogStats, getDashboard, getDataSources, getSystemStatus } from "../../../api/console";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";

export function StatusSection() {
  const status = useAsyncData(useCallback(getSystemStatus, []), { api: "unknown", database: "unknown" });
  const dashboard = useAsyncData(useCallback(getDashboard, []), {});
  const dataSources = useAsyncData(useCallback(getDataSources, []), []);
  const aiLogStats = useAsyncData(useCallback(getAiLogStats, []), { total: 0, today: 0, today_tokens: 0 });

  return (
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
          <Statistic title="控制台状态" value={String(dashboard.data.status || "unknown")} loading={dashboard.loading} />
        </WorkbenchCard>
      </Col>
      <Col span={6}>
        <WorkbenchCard>
          <Statistic title="数据源 / AI 日志" value={`${dataSources.data.length} / ${aiLogStats.data.total}`} loading={dataSources.loading || aiLogStats.loading} />
        </WorkbenchCard>
      </Col>
    </Row>
  );
}
