import { useRef, useState } from "react";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import type { PagerMotionSink } from "../components/pagerMotion";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { AiSuggestionsPanel } from "./AiSuggestionsPanel";
import { AlertsContent } from "./AlertsPage";
import { InboxNotesPanel } from "./InboxNotesPanel";
import { PendingReportsPanel } from "./PendingReportsPanel";

// 四个页签是同一回事：外部输入等我处理。笔记这一项收的是 MCP 写进来的未分组笔记。
const taskTabs = [
  { key: "suggestions", label: "AI 推荐词" },
  { key: "pending-reports", label: "待处理报告" },
  { key: "notes", label: "笔记" },
  { key: "alerts", label: "预警事件" }
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
