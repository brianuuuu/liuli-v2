import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { CandidatesSection } from "./sections/CandidatesSection";
import { FlashSection } from "./sections/FlashSection";
import { GraphSection } from "./sections/GraphSection";
import { OverviewSection } from "./sections/OverviewSection";
import { RankingsSection } from "./sections/RankingsSection";
import { SourcesSection } from "./sections/SourcesSection";
import { TagsSection } from "./sections/TagsSection";

export function MarketRadarSections({ activeTab }: { activeTab: string }) {
  if (activeTab === "overview") return <OverviewSection />;
  if (activeTab === "rankings") return <RankingsSection />;
  if (activeTab === "sources") return <SourcesSection />;
  if (activeTab === "flashes") return <FlashSection />;
  if (activeTab === "tags") return <TagsSection />;
  if (activeTab === "candidates") return <CandidatesSection />;
  if (activeTab === "graph") return <GraphSection />;
  return <WorkbenchCard>未知页面</WorkbenchCard>;
}
