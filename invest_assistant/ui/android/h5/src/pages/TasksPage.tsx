import { useRef, useState } from "react";
import { HorizontalTabPager, type HorizontalTabPagerHandle, type PagerMotion } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { AiSuggestionsPanel } from "./AiSuggestionsPanel";
import { AlertsContent } from "./AlertsPage";

const taskTabs = [
  { key: "suggestions", label: "AI 推荐词" },
  { key: "alerts", label: "预警事件" }
] as const;

type TaskTab = typeof taskTabs[number]["key"];

export function TasksPage() {
  const [tab, setTab] = useState<TaskTab>("suggestions");
  const [motion, setMotion] = useState<PagerMotion | null>(null);
  const pager = useRef<HorizontalTabPagerHandle<TaskTab>>(null);
  return (
    <MobilePageFrame navigation={<SecondaryNavigation items={taskTabs} activeKey={tab} motion={motion} onChange={(key) => pager.current?.requestChange(key)} />}>
      <HorizontalTabPager
        ref={pager}
        items={taskTabs}
        activeKey={tab}
        onChange={setTab}
        onMotionChange={setMotion}
        renderPage={(key) => key === "suggestions" ? <AiSuggestionsPanel /> : <AlertsContent />}
      />
    </MobilePageFrame>
  );
}
