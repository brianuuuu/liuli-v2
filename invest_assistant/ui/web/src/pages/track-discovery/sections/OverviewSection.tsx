import { Col, Row, Statistic } from "antd";
import { useCallback } from "react";
import { listTracks } from "../../../api/trackDiscovery";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";

export function OverviewSection() {
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const candidate = tracks.data.filter((item) => item.status === "candidate").length;
  const active = tracks.data.filter((item) => item.status === "active").length;
  const archived = tracks.data.filter((item) => item.status === "archived").length;

  return (
    <Row gutter={[10, 10]}>
      <Col span={6}>
        <WorkbenchCard><Statistic title="赛道总数" value={tracks.data.length} loading={tracks.loading} /></WorkbenchCard>
      </Col>
      <Col span={6}>
        <WorkbenchCard><Statistic title="候选赛道" value={candidate} loading={tracks.loading} /></WorkbenchCard>
      </Col>
      <Col span={6}>
        <WorkbenchCard><Statistic title="活跃赛道" value={active} loading={tracks.loading} /></WorkbenchCard>
      </Col>
      <Col span={6}>
        <WorkbenchCard><Statistic title="归档赛道" value={archived} loading={tracks.loading} /></WorkbenchCard>
      </Col>
    </Row>
  );
}
