import { Col, Row, Statistic } from "antd";
import { useCallback } from "react";
import { listCompareGroups, listStockPool, listStockReports } from "../../../api/stockAnalysis";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";

export function OverviewSection() {
  const pool = useAsyncData(useCallback(listStockPool, []), []);
  const reports = useAsyncData(useCallback(listStockReports, []), []);
  const compareGroups = useAsyncData(useCallback(listCompareGroups, []), []);
  const holding = pool.data.filter((item) => item.status === "holding").length;

  return (
    <Row gutter={[10, 10]}>
      <Col span={6}><WorkbenchCard><Statistic title="标的池" value={pool.data.length} loading={pool.loading} /></WorkbenchCard></Col>
      <Col span={6}><WorkbenchCard><Statistic title="持仓观察" value={holding} loading={pool.loading} /></WorkbenchCard></Col>
      <Col span={6}><WorkbenchCard><Statistic title="分析报告" value={reports.data.length} loading={reports.loading} /></WorkbenchCard></Col>
      <Col span={6}><WorkbenchCard><Statistic title="对比组" value={compareGroups.data.length} loading={compareGroups.loading} /></WorkbenchCard></Col>
    </Row>
  );
}
