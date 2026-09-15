import { Button, Popconfirm, Space, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MouseEvent } from "react";
import { useCallback, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import {
  deleteAlertEvent,
  deleteAlertRule,
  disableAlertRule,
  enableAlertRule,
  getAlertEventStats,
  listAlertEvents,
  listAlertRules,
  markAlertRead,
  markAllAlertsRead
} from "../../api/alerts";
import { PageHeader } from "../../components/common/PageHeader";
import { RecordTable } from "../../components/common/RecordTable";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { Page } from "../../types/api";

const EVENT_PAGE_SIZE = 20;
const HANDLED_STATUSES = ["read", "handled"];

const emptyEventPage: Page<Record<string, unknown>> = {
  items: [],
  total: 0,
  limit: EVENT_PAGE_SIZE,
  offset: 0,
  has_more: false
};

const emptyEventStats = { total: 0, unread: 0, read: 0, handled: 0, unhandled: 0 };

export function AlertsPage() {
  const [activeTab, setActiveTab] = useState("events");
  const [eventPage, setEventPage] = useState(1);
  const [eventPageSize, setEventPageSize] = useState(EVENT_PAGE_SIZE);
  // 停在规则页时不该重新拉事件，所以只用状态过滤本身作为依赖，而不是 activeTab。
  const handledOnly = activeTab === "handled";
  const events = useAsyncData(
    useCallback(
      async () =>
        listAlertEvents({
          limit: eventPageSize,
          offset: (eventPage - 1) * eventPageSize,
          ...(handledOnly ? { status: HANDLED_STATUSES } : {})
        }),
      [handledOnly, eventPage, eventPageSize]
    ),
    emptyEventPage
  );
  const stats = useAsyncData(useCallback(getAlertEventStats, []), emptyEventStats);
  const rules = useAsyncData(useCallback(listAlertRules, []), []);

  function stopRowClick(event?: MouseEvent<HTMLElement>) {
    event?.stopPropagation();
  }

  async function refreshEvents() {
    await Promise.all([events.refresh(), stats.refresh()]);
  }

  function switchTab(nextTab: string) {
    setActiveTab(nextTab);
    setEventPage(1);
  }

  async function handleReadEvent(record: Record<string, unknown>) {
    await markAlertRead(Number(record.id));
    message.success("预警已读");
    await refreshEvents();
  }

  async function handleDeleteEvent(record: Record<string, unknown>) {
    await deleteAlertEvent(Number(record.id));
    message.success("预警已删除");
    await refreshEvents();
  }

  async function handleReadAllEvents() {
    const result = await markAllAlertsRead();
    message.success(result.updated_count ? `已读 ${result.updated_count} 条预警` : "没有未读预警");
    await refreshEvents();
  }

  async function handleEnableRule(record: Record<string, unknown>) {
    await enableAlertRule(Number(record.id));
    message.success("预警规则已启用");
    await rules.refresh();
  }

  async function handleDisableRule(record: Record<string, unknown>) {
    await disableAlertRule(Number(record.id));
    message.success("预警规则已禁用");
    await rules.refresh();
  }

  async function handleDeleteRule(record: Record<string, unknown>) {
    await deleteAlertRule(Number(record.id));
    message.success("预警规则已删除");
    await rules.refresh();
  }

  const eventColumns: ColumnsType<Record<string, unknown>> = [
    { title: "标题", dataIndex: "title" },
    { title: "级别", dataIndex: "event_level" },
    { title: "状态", dataIndex: "status" },
    { title: "时间", dataIndex: "created_at" },
    {
      title: "操作",
      key: "actions",
      width: 150,
      render: (_, record) => (
        <Space size={4} onClick={stopRowClick}>
          <Button size="small" disabled={record.status !== "unread"} onClick={() => handleReadEvent(record)}>
            已读
          </Button>
          <Popconfirm title="删除这条预警？" okText="删除" cancelText="取消" onConfirm={() => handleDeleteEvent(record)}>
            <Button size="small" danger onClick={stopRowClick}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const ruleColumns: ColumnsType<Record<string, unknown>> = [
    { title: "规则", dataIndex: "name" },
    { title: "类型", dataIndex: "rule_type" },
    { title: "启用", dataIndex: "enabled", render: (value: boolean) => (value ? "是" : "否") },
    {
      title: "操作",
      key: "actions",
      width: 190,
      render: (_, record) => (
        <Space size={4} onClick={stopRowClick}>
          <Button size="small" disabled={record.enabled === true} onClick={() => handleEnableRule(record)}>
            启用
          </Button>
          <Button size="small" disabled={record.enabled !== true} onClick={() => handleDisableRule(record)}>
            禁用
          </Button>
          <Popconfirm title="删除这条规则？" okText="删除" cancelText="取消" onConfirm={() => handleDeleteRule(record)}>
            <Button size="small" danger onClick={stopRowClick}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const unreadCount = stats.data.unread;
  const actions = activeTab === "events" && unreadCount ? <Button onClick={handleReadAllEvents}>一键已读</Button> : null;
  const eventPagination = {
    current: eventPage,
    pageSize: eventPageSize,
    total: events.data.total,
    showSizeChanger: true,
    pageSizeOptions: [20, 50, 100],
    onChange: (nextPage: number, nextPageSize: number) => {
      setEventPage(nextPage);
      setEventPageSize(nextPageSize);
    }
  };

  return (
    <>
      <PageHeader title="预警中心" description="事件 / 规则 / 处理" actions={actions} />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.alerts} onChange={switchTab} />
      {activeTab === "rules" ? (
        <RecordTable loading={rules.loading} data={rules.data} columns={ruleColumns} emptyText="暂无预警规则" drawerTitle="规则详情" />
      ) : activeTab === "handled" ? (
        <RecordTable
          loading={events.loading}
          data={events.data.items}
          columns={eventColumns}
          emptyText="暂无处理记录"
          drawerTitle="处理记录详情"
          pagination={eventPagination}
        />
      ) : (
        <RecordTable
          loading={events.loading}
          data={events.data.items}
          columns={eventColumns}
          emptyText="暂无预警事件"
          drawerTitle="预警事件详情"
          pagination={eventPagination}
        />
      )}
    </>
  );
}
