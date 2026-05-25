import { Button, Drawer, Form, Input, Modal, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { createHotword, getTagTrend, listHotwords } from "../../../api/marketRadar";
import { ChartCard } from "../../../components/charts/ChartCard";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { StatusTag } from "../../../components/common/StatusTag";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { Hotword, TagHeat } from "../../../types/api";
import { formatTime, trendLineOption } from "./shared";

type HotwordFormValues = {
  name: string;
  description?: string;
  status: string;
};

const hotwordStatusOptions = [
  { value: "active", label: "启用" },
  { value: "candidate", label: "候选" },
  { value: "archived", label: "停用" }
];

function HotwordStatusTag({ status }: { status?: string }) {
  const label = hotwordStatusOptions.find((item) => item.value === status)?.label || status || "-";
  return <StatusTag status={status} label={label} />;
}

export function TagsSection() {
  const hotwords = useAsyncData(useCallback(() => listHotwords(), []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("active");
  const [selected, setSelected] = useState<Hotword | null>(null);
  const [trend, setTrend] = useState<TagHeat[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<HotwordFormValues>();

  const rows = useMemo(
    () => hotwords.data.filter((item) => !statusFilter || item.status === statusFilter),
    [hotwords.data, statusFilter]
  );
  const statusButtons = [{ value: undefined, label: "全部" }, ...hotwordStatusOptions];

  function openCreate() {
    form.setFieldsValue({ status: "active" });
    setCreateOpen(true);
  }

  async function submitCreate() {
    const values = await form.validateFields();
    await createHotword({
      name: values.name,
      description: values.description || null,
      status: values.status
    });
    message.success("热点词已新增");
    setCreateOpen(false);
    form.resetFields();
    await hotwords.refresh();
  }

  async function showTrend(record: Hotword) {
    setSelected(record);
    setTrendLoading(true);
    try {
      const firstTag = record.tags[0]?.tag;
      setTrend(firstTag ? await getTagTrend(firstTag.id) : []);
    } finally {
      setTrendLoading(false);
    }
  }

  const columns: ColumnsType<Hotword> = [
    { title: "名称", dataIndex: "name" },
    { title: "标签词", width: 220, render: (_, record) => record.tags.map((item) => item.tag.name).join("，") || "-" },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <HotwordStatusTag status={value} /> },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => showTrend(record)}>查看</Button>
        </Space>
      )
    }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <Space size={4} className="toolbar-status-buttons">
              {statusButtons.map((item) => (
                <Button
                  key={item.value || "all"}
                  size="small"
                  className={statusFilter === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                  onClick={() => setStatusFilter(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={openCreate}>新增热点词</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={hotwords.loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无标签" /> }}
        />
      </DataPanel>

      <Modal title="新增热点词" open={createOpen} onCancel={() => { setCreateOpen(false); form.resetFields(); }} onOk={submitCreate} destroyOnHidden forceRender>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="热点词名称" rules={[{ required: true, message: "请输入热点词名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={hotwordStatusOptions.filter((item) => item.value !== "candidate")} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title={selected ? `${selected.name} 热度趋势` : "热度趋势"} open={Boolean(selected)} onClose={() => setSelected(null)} size={620}>
        {trend.length ? (
          <ChartCard title="历史热度" option={trendLineOption(trend, selected?.name)} height={300} />
        ) : (
          <WorkbenchCard title="历史热度">
            <EmptyAction description={trendLoading ? "加载中" : "暂无趋势数据"} />
          </WorkbenchCard>
        )}
      </Drawer>
    </>
  );
}

