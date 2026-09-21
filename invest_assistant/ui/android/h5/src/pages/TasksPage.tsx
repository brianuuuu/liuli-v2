import { useRef, useState } from "react";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import type { PagerMotionSink } from "../components/pagerMotion";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { AiSuggestionsPanel } from "./AiSuggestionsPanel";
import { AlertsContent } from "./AlertsPage";
import { InboxNotesPanel } from "./InboxNotesPanel";
import { PendingReportsPanel } from "./PendingReportsPanel";

// 四个页签是同一回事：外部输入等我处理，标题都用最短的名词，扫一眼就够。
// 推荐词不叫"热词"：候选词通过后可以落到热词、赛道或标的，热词只是三个去向之一；
// 预警不叫"事件"："事件"在投研语境里指市场催化事件，这里说的是系统预警。
const taskTabs = [
  { key: "suggestions", label: "推荐词" },
  { key: "pending-reports", label: "报告" },
  { key: "notes", label: "笔记" },
  { key: "alerts", label: "预警" }
] as const;

type TaskTab = typeof taskTabs[number]["key"];

export function TasksPage() {
  const [tab, setTab] = useState<TaskTab>("suggestions");
  const pager = useRef<HorizontalTabPagerHandle<TaskTab>>(null);
  const navigationMotion = useRef<PagerMotionSink | null>(null);
  return (
    <MobilePageFrame navigation={<SecondaryNavigation ref={navigationMotion} items={taskTabs} activeKey={tab} onChange={(key) => pager.current?.requestChange(key)} />}>
      <HorizontalTabPager
        ref={pager}
        items={taskTabs}
        activeKey={tab}
        onChange={setTab}
        motionSink={navigationMotion}
        renderPage={(key) => key === "suggestions"
          ? <AiSuggestionsPanel />
          : key === "pending-reports" ? <PendingReportsPanel />
          : key === "notes" ? <InboxNotesPanel /> : <AlertsContent />}
      />
    </MobilePageFrame>
  );
}
