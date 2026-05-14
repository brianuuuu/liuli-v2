import { useParams } from "react-router-dom";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";

export function PortfolioDetailPage() {
  const { id } = useParams();
  return (
    <>
      <PageHeader title="组合详情" description={`组合 ID：${id || "-"}`} />
      <WorkbenchCard title="持仓"><EmptyAction description="暂无持仓数据" /></WorkbenchCard>
      <WorkbenchCard title="风险暴露"><EmptyAction description="暂无风险暴露数据" /></WorkbenchCard>
      <WorkbenchCard title="复盘"><EmptyAction description="暂无组合复盘" /></WorkbenchCard>
    </>
  );
}
