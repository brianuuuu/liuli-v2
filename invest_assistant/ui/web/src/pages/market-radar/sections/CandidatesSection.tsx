import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { approveTagCandidate, createTagCandidate, listTagCandidates, mergeTagCandidate, rejectTagCandidate } from "../../../api/marketRadar";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { StatusTag } from "../../../components/common/StatusTag";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TagCandidate } from "../../../types/api";
import { formatTime, rankingTypeOptions, TagTypeTag } from "./shared";

type CandidateFormValues = {
  name: string;
  suggested_type: string;
  category?: string;
  source_item_id?: number;
  confidence?: number;
  reason?: string;
};

export function CandidatesSection() {
  const candidates = useAsyncData(useCallback(listTagCandidates, []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<CandidateFormValues>();

  const rows = useMemo(
    () => candidates.data.filter((item) => !statusFilter || item.status === statusFilter),
    [candidates.data, statusFilter]
  );

  function openCreate() {
    form.setFieldsValue({ suggested_type: "hotword", confidence: 0.5 });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    await createTagCandidate({
      ...values,
      category: values.category || null,
      source_item_id: values.source_item_id || null,
      reason: values.reason || null,
      status: "pending"
    });
    message.success("候选标签已新增");
    setOpen(false);
    await candidates.refresh();
  }

  async function handleAction(action: "approve" | "reject" | "merge", id: number) {
    if (action === "approve") await approveTagCandidate(id);
    if (action === "reject") await rejectTagCandidate(id);
    if (action === "merge") await mergeTagCandidate(id);
    message.success("候选标签已处理");
    await candidates.refresh();
  }

  const columns: ColumnsType<TagCandidate> = [
    { title: "名称", dataIndex: "name" },
    { title: "建议类型", dataIndex: "suggested_type", width: 110, render: (value) => <TagTypeTag type={value} /> },
    { title: "分类", dataIndex: "category", width: 120, render: (value) => value || "-" },
    { title: "置信度", dataIndex: "confidence", width: 90, render: (value) => Number(value || 0).toFixed(2) },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <StatusTag status={value} /> },
    { title: "原因", dataIndex: "reason", ellipsis: true },
    { title: "创建", dataIndex: "created_at", width: 160, render: formatTime },
    {
      title: "审核",
      width: 220,
      render: (_, record) => {
        const disabled = record.status !== "pending";
        return (
          <Space>
            <Button size="small" disabled={disabled} onClick={() => handleAction("approve", record.id)}>通过</Button>
            <Button size="small" disabled={disabled} onClick={() => handleAction("merge", record.id)}>合并</Button>
            <Button size="small" danger disabled={disabled} onClick={() => handleAction("reject", record.id)}>拒绝</Button>
          </Space>
        );
      }
    }
  ];

  return (
    <>
      <WorkbenchCard
        title="候选标签"
        extra={
          <Space>
            <Select
              allowClear
              size="small"
              placeholder="状态"
              value={statusFilter}
              style={{ width: 120 }}
              onChange={setStatusFilter}
              options={[
                { value: "pending", label: "pending" },
                { value: "approved", label: "approved" },
                { value: "merged", label: "merged" },
                { value: "rejected", label: "rejected" }
              ]}
            />
            <Button size="small" type="primary" onClick={openCreate}>新增候选</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={candidates.loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无候选标签" /> }}
        />
      </WorkbenchCard>

      <Modal title="新增候选标签" open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="suggested_type" label="建议类型" rules={[{ required: true, message: "请选择建议类型" }]}>
            <Select options={rankingTypeOptions.filter((item) => item.value !== "stock")} />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="source_item_id" label="来源 ID" style={{ width: "50%" }}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="confidence" label="置信度" style={{ width: "50%" }}>
              <InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="reason" label="原因">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
