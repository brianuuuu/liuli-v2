import { Col, Row, Statistic } from "antd";
import { useCallback, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { listCompareGroups, listStockPool, listStockReports } from "../../api/stockAnalysis";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { RecordTable } from "../../components/common/RecordTable";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";

const columns = [
  { title: "名称", dataIndex: "name" },
  { title: "股票", dataIndex: "stock_name" },
  { title: "状态", dataIndex: "status" },
  { title: "评分", dataIndex: "score" }
];

export function StockAnalysisPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const pool = useAsyncData(useCallback(listStockPool, []), []);
  const reports = useAsyncData(useCallback(listStockReports, []), []);
  const compareGroups = useAsyncData(useCallback(listCompareGroups, []), []);

  function content() {
    if (activeTab === "overview") {
      return (
        <Row gutter={[12, 12]}>
          <Col span={8}><WorkbenchCard><Statistic title="标的池" value={pool.data.length} loading={pool.loading} /></WorkbenchCard></Col>
          <Col span={8}><WorkbenchCard><Statistic title="分析报告" value={reports.data.length} loading={reports.loading} /></WorkbenchCard></Col>
          <Col span={8}><WorkbenchCard><Statistic title="对比组" value={compareGroups.data.length} loading={compareGroups.loading} /></WorkbenchCard></Col>
        </Row>
      );
    }
    if (activeTab === "pool") return <RecordTable loading={pool.loading} data={pool.data} columns={columns} emptyText="暂无标的池数据" drawerTitle="标的池详情" />;
    if (activeTab === "scores") return <WorkbenchCard><EmptyAction description="请选择标的后查看评分快照" /></WorkbenchCard>;
    if (activeTab === "reports") return <RecordTable loading={reports.loading} data={reports.data} columns={columns} emptyText="暂无标的分析报告" drawerTitle="报告详情" />;
    return <RecordTable loading={compareGroups.loading} data={compareGroups.data} columns={columns} emptyText="暂无标的对比组" drawerTitle="对比组详情" />;
  }

  return (
    <>
      <PageHeader title="标的分析" description="找出能承接赛道逻辑的公司" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs["stock-analysis"]} onChange={setActiveTab} />
      {content()}
    </>
  );
}
