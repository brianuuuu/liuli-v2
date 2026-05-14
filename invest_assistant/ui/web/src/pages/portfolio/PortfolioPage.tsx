import type { EChartsOption } from "echarts";
import { useCallback, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { listPortfolios } from "../../api/portfolio";
import { ChartCard } from "../../components/charts/ChartCard";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { RecordTable } from "../../components/common/RecordTable";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";

const columns = [
  { title: "组合", dataIndex: "name" },
  { title: "货币", dataIndex: "base_currency" },
  { title: "状态", dataIndex: "status" },
  { title: "更新时间", dataIndex: "updated_at" }
];

export function PortfolioPage() {
  const [activeTab, setActiveTab] = useState("portfolios");
  const portfolios = useAsyncData(useCallback(listPortfolios, []), []);
  const option: EChartsOption = {
    tooltip: {},
    xAxis: { type: "category", data: portfolios.data.map((item) => String(item.status ?? "unknown")) },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: portfolios.data.map(() => 1) }]
  };

  function content() {
    if (activeTab === "portfolios") return <RecordTable loading={portfolios.loading} data={portfolios.data} columns={columns} emptyText="暂无组合，请新建组合" drawerTitle="组合详情" />;
    if (activeTab === "risk") return portfolios.data.length ? <ChartCard title="组合状态分布" option={option} /> : <WorkbenchCard><EmptyAction description="风险暴露需要组合和持仓数据" /></WorkbenchCard>;
    if (activeTab === "positions") return <WorkbenchCard><EmptyAction description="请选择组合后查看持仓" /></WorkbenchCard>;
    return <WorkbenchCard><EmptyAction description="请选择组合后查看复盘" /></WorkbenchCard>;
  }

  return (
    <>
      <PageHeader title="组合管理" description="管理持仓、权重和风险暴露" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.portfolio} onChange={setActiveTab} />
      {content()}
    </>
  );
}
