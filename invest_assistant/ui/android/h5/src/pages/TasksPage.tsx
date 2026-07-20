import { useRef, useState } from "react";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { AiSuggestionsPanel } from "./AiSuggestionsPanel";
import { AlertsContent } from "./AlertsPage";

const taskTabs = [
  { key: "alerts", label: "预警" },
  { key: "suggestions", label: "AI 推荐词" }
] as const;

type TaskTab = typeof taskTabs[number]["key"];

export function TasksPage() {
  const [tab, setTab] = useState<TaskTab>("alerts");
  const pager = useRef<HorizontalTabPagerHandle<TaskTab>>(null);
  return (
    <MobilePageFrame navigation={<SecondaryNavigation items={taskTabs} activeKey={tab} onChange={(key) => pager.current?.requestChange(key)} />}>
      <HorizontalTabPager
        ref={pager}
        items={taskTabs}
        activeKey={tab}
        onChange={setTab}
        renderPage={(key) => key === "alerts" ? <AlertsContent /> : <AiSuggestionsPanel />}
      />
    </MobilePageFrame>
  );
}
