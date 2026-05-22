import { Button, Drawer, Form, Input, Modal, Select, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { createHotword, getTagTrend, listMarketTags } from "../../../api/marketRadar";
import { ChartCard } from "../../../components/charts/ChartCard";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { StatusTag } from "../../../components/common/StatusTag";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { MarketTag, TagHeat } from "../../../types/api";
import { formatTime, trendLineOption } from "./shared";

type HotwordFormValues = {
  name: string;
  aliases?: string;
  status: string;
};

function parseAliases(value?: string) {
  return (value || "")
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function TagsSection() {
  const tags = useAsyncData(useCallback(() => listMarketTags("hotword"), []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [selected, setSelected] = useState<MarketTag | null>(null);
  const [trend, setTrend] = useState<TagHeat[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<HotwordFormValues>();

  const rows = useMemo(
    () => tags.data.filter((item) => !statusFilter || item.status === statusFilter),
    [tags.data, statusFilter]
  );

  function openCreate() {
    form.setFieldsValue({ status: "active" });
    setCreateOpen(true);
  }

  async function submitCreate() {
    const values = await form.validateFields();
    await createHotword({
      name: values.name,
      aliases: parseAliases(values.aliases),
      status: values.status
    });
    message.success("热点词已新增");
    setCreateOpen(false);
    form.resetFields();
    await tags.refresh();
  }

  async function showTrend(record: MarketTag) {
    setSelected(record);
    setTrendLoading(true);
    try {
      setTrend(await getTagTrend(record.id));
    } finally {
      setTrendLoading(false);
    }
  }

  const columns: ColumnsType<MarketTag> = [
    { title: "名称", dataIndex: "name" },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <StatusTag status={value} /> },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    { title: "趋势", width: 80, render: (_, record) => <Button size="small" onClick={() => showTrend(record)}>查看</Button> }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <Select
              allowClear
              size="small"
              placeholder="状态"
              value={statusFilter}
              style={{ width: 110 }}
              onChange={setStatusFilter}
              options={[{ value: "active", label: "active" }, { value: "candidate", label: "candidate" }, { value: "disabled", label: "disabled" }]}
            />
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={openCreate}>新增热点词</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={tags.loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无标签" /> }}
        />
      </DataPanel>

      <Modal title="新增热点词" open={createOpen} onCancel={() => { setCreateOpen(false); form.resetFields(); }} onOk={submitCreate} destroyOnHidden forceRender>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="热点词名称" rules={[{ required: true, message: "请输入热点词名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="aliases" label="别名">
            <Input.TextArea rows={3} placeholder="多个别名用逗号或换行分隔" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={[{ value: "active", label: "active" }, { value: "disabled", label: "disabled" }]} />
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

