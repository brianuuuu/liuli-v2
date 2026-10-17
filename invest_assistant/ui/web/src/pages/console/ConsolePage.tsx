import { useState } from "react";
import { useLocation } from "react-router-dom";
import { moduleTabs } from "../../app/navigation";
import { PageHeader } from "../../components/common/PageHeader";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { ConsoleSections } from "./sections";

export function ConsolePage() {
  // 工作台"查看日志"带 state.tab 跳进来时直接落到任务中心
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => (location.state as { tab?: string } | null)?.tab || "status");
  return (
    <>
      <PageHeader title="控制台" description="任务 / 数据 / 配置" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.console} onChange={setActiveTab} />
      <ConsoleSections activeTab={activeTab} />
    </>
  );
}
