import { Button, Form, Input, InputNumber, Modal, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import { createCompareGroup, listCompareGroups } from "../../../api/stockAnalysis";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { StockCompareGroup } from "../../../types/api";
import { formatTime } from "./shared";

type CompareFormValues = {
  name: string;
  track_id?: number;
  stock_ids: string;
  description?: string;
};

export function CompareSection() {
  const groups = useAsyncData(useCallback(listCompareGroups, []), []);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<CompareFormValues>();

  async function submit() {
    const values = await form.validateFields();
    await createCompareGroup({
      name: values.name,
      track_id: values.track_id || null,
      stock_ids: values.stock_ids,
      description: values.description || null
    });
    message.success("对比组已创建");
    setOpen(false);
    await groups.refresh();
  }

  const columns: ColumnsType<StockCompareGroup> = [
    { title: "名称", dataIndex: "name" },
    { title: "Track ID", dataIndex: "track_id", width: 100, render: (value) => value || "-" },
    { title: "标的 ID", dataIndex: "stock_ids", ellipsis: true },
    { title: "说明", dataIndex: "description", ellipsis: true, render: (value) => value || "-" },
    { title: "创建", dataIndex: "created_at", width: 160, render: formatTime }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={() => setOpen(true)}>新增对比组</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={groups.loading}
          dataSource={groups.data}
          columns={columns}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无标的对比组" /> }}
        />
      </DataPanel>

      <Modal title="新增对比组" open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="track_id" label="Track ID">
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="stock_ids" label="标的 ID" rules={[{ required: true, message: "请输入标的 ID" }]} extra="逗号分隔，如 1,2,3">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
