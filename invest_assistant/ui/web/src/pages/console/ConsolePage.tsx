import { useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { PageHeader } from "../../components/common/PageHeader";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { ConsoleSections } from "./sections";

export function ConsolePage() {
  const [activeTab, setActiveTab] = useState("status");
  return (
    <>
      <PageHeader title="控制台" description="任务 / 数据 / 配置" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.console} onChange={setActiveTab} />
      <ConsoleSections activeTab={activeTab} />
    </>
  );
}
