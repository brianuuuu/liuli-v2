import { useCallback, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { listKnowledgeAgents, listKnowledgeFeedbackLogs, listKnowledgeNotes, listKnowledgeSkills } from "../../api/knowledge";
import { PageHeader } from "../../components/common/PageHeader";
import { RecordTable } from "../../components/common/RecordTable";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";

const columns = [
  { title: "标题", dataIndex: "title" },
  { title: "名称", dataIndex: "name" },
  { title: "类型", dataIndex: "note_type" },
  { title: "状态", dataIndex: "status" }
];

export function KnowledgePage() {
  const [activeTab, setActiveTab] = useState("notes");
  const notes = useAsyncData(useCallback(listKnowledgeNotes, []), []);
  const skills = useAsyncData(useCallback(listKnowledgeSkills, []), []);
  const agents = useAsyncData(useCallback(listKnowledgeAgents, []), []);
  const feedback = useAsyncData(useCallback(listKnowledgeFeedbackLogs, []), []);

  function content() {
    if (activeTab === "skills") return <RecordTable loading={skills.loading} data={skills.data} columns={columns} emptyText="暂无 Skills" drawerTitle="Skill 详情" />;
    if (activeTab === "agents") return <RecordTable loading={agents.loading} data={agents.data} columns={columns} emptyText="暂无 Agents" drawerTitle="Agent 详情" />;
    if (activeTab === "feedback") return <RecordTable loading={feedback.loading} data={feedback.data} columns={columns} emptyText="暂无反馈日志" drawerTitle="反馈详情" />;
    return <RecordTable loading={notes.loading} data={notes.data} columns={columns} emptyText="暂无知识笔记" drawerTitle="笔记详情" />;
  }

  return (
    <>
      <PageHeader title="知识库" description="沉淀经验，提炼 Skills，编排 Agent" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.knowledge} onChange={setActiveTab} />
      {content()}
    </>
  );
}
