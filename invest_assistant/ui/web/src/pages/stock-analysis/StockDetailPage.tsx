import { useParams } from "react-router-dom";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";

export function StockDetailPage() {
  const { id } = useParams();
  return (
    <>
      <PageHeader title="标的详情" description={`标的 ID：${id || "-"}`} />
      <WorkbenchCard title="研究笔记"><EmptyAction description="暂无研究笔记" /></WorkbenchCard>
      <WorkbenchCard title="评分快照"><EmptyAction description="暂无评分快照" /></WorkbenchCard>
      <WorkbenchCard title="分析报告"><EmptyAction description="暂无分析报告" /></WorkbenchCard>
    </>
  );
}
