import { useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { CompareSection } from "./sections/CompareSection";
import { OverviewSection } from "./sections/OverviewSection";
import { PoolSection } from "./sections/PoolSection";
import { ReportsSection } from "./sections/ReportsSection";
import { ScoresSection } from "./sections/ScoresSection";

export function StockAnalysisPage() {
  const [activeTab, setActiveTab] = useState("overview");

  function content() {
    if (activeTab === "overview") return <OverviewSection />;
    if (activeTab === "pool") return <PoolSection />;
    if (activeTab === "scores") return <ScoresSection />;
    if (activeTab === "reports") return <ReportsSection />;
    if (activeTab === "compare") return <CompareSection />;
    return <WorkbenchCard>未知页面</WorkbenchCard>;
  }

  return (
    <>
      <PageHeader title="标的分析" description="标的池 / 评分 / 报告" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs["stock-analysis"]} onChange={setActiveTab} />
      {content()}
    </>
  );
}
