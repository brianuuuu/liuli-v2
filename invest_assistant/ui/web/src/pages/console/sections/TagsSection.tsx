import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, message } from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  approveTagCandidate,
  disableMarketTag,
  listMarketTags,
  listTagCandidates,
  mergeTagCandidate,
  rejectTagCandidate,
  updateMarketTag
} from "../../../api/marketRadar";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";

type TagFormValues = {
  name: string;
  type: string;
  status: string;
};

export function TagsSection() {
  const tags = useAsyncData(useCallback(listMarketTags, []), []);
  const [form] = Form.useForm<TagFormValues>();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const filteredTags = typeFilter ? tags.data.filter((tag) => tag.type === typeFilter) : tags.data;

  useEffect(() => {
    if (!open || !editing) return;
    form.resetFields();
    form.setFieldsValue({
      name: String(editing.name ?? ""),
      type: String(editing.type ?? "hotword"),
      status: String(editing.status ?? "active")
    });
  }, [editing, form, open]);

  function openEdit(record: Record<string, unknown>) {
    setEditing(record);
    setOpen(true);
  }

  async function submit() {
    if (!editing?.id) return;
    const values = await form.validateFields();
    await updateMarketTag(Number(editing.id), {
      name: values.name,
      status: values.status
    });
    message.success("标签已更新");
    setOpen(false);
    setEditing(null);
    await tags.refresh();
  }

  async function disable(record: Record<string, unknown>) {
    await disableMarketTag(Number(record.id));
    message.success("标签已停用");
    await tags.refresh();
  }

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <Select
              allowClear
              size="small"
              placeholder="标签类型"
              value={typeFilter}
              style={{ width: 128 }}
              onChange={setTypeFilter}
              options={[
                { value: "stock", label: "标的" },
                { value: "track", label: "赛道" },
                { value: "hotword", label: "热点词" }
              ]}
            />
            <div className="data-panel-toolbar-spacer" />
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={tags.loading}
          dataSource={filteredTags}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          columns={[
            { title: "名称", dataIndex: "name" },
            { title: "类型", dataIndex: "type" },
            { title: "绑定实体", render: (_, record) => record.stock_id ? `stock:${record.stock_id}` : record.track_id ? `track:${record.track_id}` : "-" },
            { title: "状态", dataIndex: "status" },
            {
              title: "操作",
              width: 170,
              render: (_, record) => (
                <Space>
                  <Button size="small" disabled={record.type === "stock"} onClick={() => openEdit(record)}>编辑</Button>
                  <Popconfirm title="停用这个标签？" onConfirm={() => disable(record)}>
                    <Button size="small" danger disabled={record.type === "stock"}>停用</Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </DataPanel>

      <Modal title="编辑标签" open={open} onCancel={() => { setOpen(false); setEditing(null); }} onOk={submit} destroyOnHidden forceRender>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="标签名称" rules={[{ required: true, message: "请输入标签名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="标签类型" rules={[{ required: true, message: "请选择标签类型" }]}>
            <Select disabled options={[
              { value: "stock", label: "标的" },
              { value: "track", label: "赛道" },
              { value: "hotword", label: "热点词" }
            ]} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={[{ value: "active", label: "active" }, { value: "disabled", label: "disabled" }]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function TagCandidatesSection() {
  const candidates = useAsyncData(useCallback(listTagCandidates, []), []);

  async function handleAction(action: "approve" | "reject" | "merge", id: number) {
    if (action === "approve") await approveTagCandidate(id);
    if (action === "reject") await rejectTagCandidate(id);
    if (action === "merge") await mergeTagCandidate(id);
    message.success("候选标签已处理");
    await candidates.refresh();
  }

  return (
    <DataPanel>
      <Table
        rowKey="id"
        size="small"
        loading={candidates.loading}
        dataSource={candidates.data}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "建议类型", dataIndex: "suggested_type" },
          { title: "触发词", dataIndex: "trigger_text", render: (value) => value || "-" },
          { title: "置信度", dataIndex: "confidence" },
          { title: "状态", dataIndex: "status" },
          { title: "原因", dataIndex: "reason", ellipsis: true },
          {
            title: "审核",
            width: 220,
            render: (_, record) => {
              const id = Number(record.id);
              const disabled = record.status !== "pending";
              return (
                <Space>
                  <Button size="small" disabled={disabled} onClick={() => handleAction("approve", id)}>通过</Button>
                  <Button size="small" disabled={disabled} onClick={() => handleAction("merge", id)}>合并</Button>
                  <Button size="small" danger disabled={disabled} onClick={() => handleAction("reject", id)}>拒绝</Button>
                </Space>
              );
            }
          }
        ]}
      />
    </DataPanel>
  );
}
