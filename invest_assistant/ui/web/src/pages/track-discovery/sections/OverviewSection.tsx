import { Col, Row, Statistic } from "antd";
import { useCallback } from "react";
import { listTrackCandidates, listTrackTheses } from "../../../api/trackDiscovery";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";

export function OverviewSection() {
  const theses = useAsyncData(useCallback(listTrackTheses, []), []);
  const candidates = useAsyncData(useCallback(() => listTrackCandidates("24h"), []), []);
  const watching = theses.data.filter((item) => item.status === "watching").length;
  const validated = theses.data.filter((item) => item.status === "validated").length;
  const archived = theses.data.filter((item) => item.status === "archived").length;

  return (
    <Row gutter={[10, 10]}>
      <Col span={6}>
        <WorkbenchCard><Statistic title="跟踪赛道" value={theses.data.length} loading={theses.loading} /></WorkbenchCard>
      </Col>
      <Col span={6}>
        <WorkbenchCard><Statistic title="观察中" value={watching} loading={theses.loading} /></WorkbenchCard>
      </Col>
      <Col span={6}>
        <WorkbenchCard><Statistic title="已验证" value={validated} loading={theses.loading} /></WorkbenchCard>
      </Col>
      <Col span={6}>
        <WorkbenchCard><Statistic title="候选 / 归档" value={`${candidates.data.length} / ${archived}`} loading={candidates.loading || theses.loading} /></WorkbenchCard>
      </Col>
    </Row>
  );
}
