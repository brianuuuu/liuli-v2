import { useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { CandidatesSection } from "./sections/CandidatesSection";
import { EvidenceSection } from "./sections/EvidenceSection";
import { OverviewSection } from "./sections/OverviewSection";
import { ThesesSection } from "./sections/ThesesSection";

export function TrackDiscoveryPage() {
  const [activeTab, setActiveTab] = useState("overview");

  function content() {
    if (activeTab === "overview") return <OverviewSection />;
    if (activeTab === "candidates") return <CandidatesSection />;
    if (activeTab === "theses") return <ThesesSection />;
    if (activeTab === "evidence") return <EvidenceSection />;
    return <WorkbenchCard>未知页面</WorkbenchCard>;
  }

  return (
    <>
      <PageHeader title="赛道发现" description="候选 / 证据 / 跟踪" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs["track-discovery"]} onChange={setActiveTab} />
      {content()}
    </>
  );
}
