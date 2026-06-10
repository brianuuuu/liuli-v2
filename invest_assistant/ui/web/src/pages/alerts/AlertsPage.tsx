import { Button, message } from "antd";
import { useCallback, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import { listAlertEvents, listAlertRules, markAlertHandled } from "../../api/alerts";
import { PageHeader } from "../../components/common/PageHeader";
import { RecordTable } from "../../components/common/RecordTable";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";

const eventColumns = [
  { title: "标题", dataIndex: "title" },
  { title: "级别", dataIndex: "level" },
  { title: "状态", dataIndex: "status" },
  { title: "时间", dataIndex: "created_at" }
];

const ruleColumns = [
  { title: "规则", dataIndex: "name" },
  { title: "类型", dataIndex: "rule_type" },
  { title: "启用", dataIndex: "enabled", render: (value: boolean) => (value ? "是" : "否") }
];

export function AlertsPage() {
  const [activeTab, setActiveTab] = useState("events");
  const events = useAsyncData(useCallback(async () => (await listAlertEvents({ limit: 200, offset: 0 })).items, []), []);
  const rules = useAsyncData(useCallback(listAlertRules, []), []);
  const handled = events.data.filter((item) => item.status === "handled" || item.status === "read");

  async function handleFirstEvent() {
    const id = Number(events.data[0]?.id);
    if (!id) return;
    await markAlertHandled(id);
    message.success("已标记处理");
    await events.refresh();
  }

  const actions = activeTab === "events" && events.data.length ? <Button onClick={handleFirstEvent}>处理首条</Button> : null;

  return (
    <>
      <PageHeader title="预警中心" description="事件 / 规则 / 处理" actions={actions} />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.alerts} onChange={setActiveTab} />
      {activeTab === "rules" ? (
        <RecordTable loading={rules.loading} data={rules.data} columns={ruleColumns} emptyText="暂无预警规则" drawerTitle="规则详情" />
      ) : activeTab === "handled" ? (
        <RecordTable loading={events.loading} data={handled} columns={eventColumns} emptyText="暂无处理记录" drawerTitle="处理记录详情" />
      ) : (
        <RecordTable loading={events.loading} data={events.data} columns={eventColumns} emptyText="暂无预警事件" drawerTitle="预警事件详情" />
      )}
    </>
  );
}
