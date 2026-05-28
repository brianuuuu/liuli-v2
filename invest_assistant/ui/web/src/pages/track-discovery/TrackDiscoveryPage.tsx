import { useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { CompareSection } from "./sections/CompareSection";
import { MaterialsSection } from "./sections/MaterialsSection";
import { OverviewSection } from "./sections/OverviewSection";
import { TracksSection } from "./sections/ThesesSection";

export function TrackDiscoveryPage() {
  const [activeTab, setActiveTab] = useState("overview");

  function content() {
    if (activeTab === "overview") return <OverviewSection />;
    if (activeTab === "tracks") return <TracksSection />;
    if (activeTab === "materials") return <MaterialsSection />;
    if (activeTab === "compare") return <CompareSection />;
    return <WorkbenchCard>未知页面</WorkbenchCard>;
  }

  return (
    <>
      <PageHeader title="赛道发现" description="赛道库 / 动态 / 对比" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs["track-discovery"]} onChange={setActiveTab} />
      {content()}
    </>
  );
}
