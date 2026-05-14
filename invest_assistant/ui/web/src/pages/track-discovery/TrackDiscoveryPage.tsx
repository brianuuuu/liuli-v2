import { Col, Row, Statistic } from "antd";
import { useCallback, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { listTrackCandidates, listTrackTheses } from "../../api/trackDiscovery";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { RecordTable } from "../../components/common/RecordTable";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";

const columns = [
  { title: "名称", dataIndex: "name" },
  { title: "状态", dataIndex: "status" },
  { title: "置信度", dataIndex: "confidence" },
  { title: "更新时间", dataIndex: "updated_at" }
];

export function TrackDiscoveryPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const theses = useAsyncData(useCallback(listTrackTheses, []), []);
  const candidates = useAsyncData(useCallback(listTrackCandidates, []), []);

  function content() {
    if (activeTab === "overview") {
      return (
        <Row gutter={[12, 12]}>
          <Col span={8}>
            <WorkbenchCard><Statistic title="赛道列表" value={theses.data.length} loading={theses.loading} /></WorkbenchCard>
          </Col>
          <Col span={8}>
            <WorkbenchCard><Statistic title="候选赛道" value={candidates.data.length} loading={candidates.loading} /></WorkbenchCard>
          </Col>
        </Row>
      );
    }
    if (activeTab === "candidates") return <RecordTable loading={candidates.loading} data={candidates.data} columns={columns} emptyText="暂无候选赛道" drawerTitle="候选赛道详情" />;
    if (activeTab === "theses") return <RecordTable loading={theses.loading} data={theses.data} columns={columns} emptyText="暂无已跟踪赛道" drawerTitle="赛道详情" />;
    return <WorkbenchCard><EmptyAction description="请选择赛道后查看证据链" /></WorkbenchCard>;
  }

  return (
    <>
      <PageHeader title="赛道发现" description="判断方向是否值得长期跟踪" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs["track-discovery"]} onChange={setActiveTab} />
      {content()}
    </>
  );
}
