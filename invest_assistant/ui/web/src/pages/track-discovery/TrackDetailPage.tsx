import { useParams } from "react-router-dom";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";

export function TrackDetailPage() {
  const { id } = useParams();
  return (
    <>
      <PageHeader title="赛道详情" description={`赛道 ID：${id || "-"}`} />
      <WorkbenchCard title="基础信息"><EmptyAction description="赛道基础信息会在数据创建后展示" /></WorkbenchCard>
      <WorkbenchCard title="验证指标"><EmptyAction description="暂无验证指标" /></WorkbenchCard>
      <WorkbenchCard title="证据链"><EmptyAction description="暂无证据链" /></WorkbenchCard>
    </>
  );
}
