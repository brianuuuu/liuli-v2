import { useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { PageHeader } from "../../components/common/PageHeader";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { MarketRadarSections } from "./sections";

export function MarketRadarPage() {
  const [activeTab, setActiveTab] = useState("overview");
  return (
    <>
      <PageHeader title="市场雷达" description="信号 / 热度 / 关系" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs["market-radar"]} onChange={setActiveTab} />
      <MarketRadarSections activeTab={activeTab} />
    </>
  );
}
