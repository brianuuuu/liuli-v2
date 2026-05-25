import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import {
  approveAiTagSuggestion,
  createAiTagSuggestion,
  listAiTagSuggestions,
  rejectAiTagSuggestion,
  restoreAiTagSuggestion
} from "../../../api/marketRadar";
import { DataPanel } from "../../../components/common/DataPanel";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { StatusTag } from "../../../components/common/StatusTag";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { AiTagSuggestion } from "../../../types/api";
import { formatTime } from "./shared";

type SuggestionFormValues = {
  suggested_text: string;
  score?: number;
  reason?: string;
};

type ApproveFormValues = {
  final_tag_name?: string;
  target_type: "stock" | "track" | "hotword";
  target_id?: number;
  target_name?: string;
};

const statusOptions = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" }
];

const targetTypeOptions = [
  { value: "hotword", label: "市场热词" },
  { value: "track", label: "赛道" },
  { value: "stock", label: "标的" }
];

function SuggestionStatusTag({ status }: { status?: string }) {
  const label = statusOptions.find((item) => item.value === status)?.label || status || "-";
  return <StatusTag status={status} label={label} />;
}

export function CandidatesSection() {
  const suggestions = useAsyncData(useCallback(listAiTagSuggestions, []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const [createOpen, setCreateOpen] = useState(false);
  const [approving, setApproving] = useState<AiTagSuggestion | null>(null);
  const [form] = Form.useForm<SuggestionFormValues>();
  const [approveForm] = Form.useForm<ApproveFormValues>();

  const rows = useMemo(
    () => suggestions.data.filter((item) => !statusFilter || item.status === statusFilter),
    [suggestions.data, statusFilter]
  );
  const statusButtons = [{ value: undefined, label: "全部" }, ...statusOptions];

  async function submitCreate() {
    const values = await form.validateFields();
    await createAiTagSuggestion({
      suggested_text: values.suggested_text,
      score: values.score ?? null,
      reason: values.reason || null,
      status: "pending"
    });
    message.success("AI 推荐词已新增");
    setCreateOpen(false);
    form.resetFields();
    await suggestions.refresh();
  }

  function openApprove(record: AiTagSuggestion) {
    setApproving(record);
    approveForm.setFieldsValue({
      final_tag_name: record.final_tag_name || record.suggested_text,
      target_type: "hotword",
      target_name: record.final_tag_name || record.suggested_text
    });
  }

  async function submitApprove() {
    if (!approving) return;
    const values = await approveForm.validateFields();
    await approveAiTagSuggestion(approving.id, {
      final_tag_name: values.final_tag_name || null,
      target_type: values.target_type,
      target_id: values.target_id || null,
      target_name: values.target_name || values.final_tag_name || approving.suggested_text
    });
    message.success("AI 推荐词已通过");
    setApproving(null);
    approveForm.resetFields();
    await suggestions.refresh();
  }

  async function reject(record: AiTagSuggestion) {
    await rejectAiTagSuggestion(record.id);
    message.success("AI 推荐词已拒绝");
    await suggestions.refresh();
  }

  async function restore(record: AiTagSuggestion) {
    await restoreAiTagSuggestion(record.id);
    message.success("AI 推荐词已恢复");
    await suggestions.refresh();
  }

  const columns: ColumnsType<AiTagSuggestion> = [
    { title: "推荐词", dataIndex: "suggested_text", width: 150, ellipsis: true },
    { title: "最终标签", dataIndex: "final_tag_name", width: 150, ellipsis: true, render: (value) => value || "-" },
    { title: "分数", dataIndex: "score", width: 80, render: (value) => (value == null ? "-" : Number(value).toFixed(1)) },
    { title: "状态", dataIndex: "status", width: 92, render: (value) => <SuggestionStatusTag status={value} /> },
    { title: "原因", dataIndex: "reason", width: 220, ellipsis: true, render: (value) => value || "-" },
    { title: "创建", dataIndex: "created_at", width: 132, render: (value) => formatTime(value).slice(5, 16) },
    {
      title: "操作",
      width: 150,
      render: (_, record) => {
        if (record.status === "rejected") return <Button size="small" onClick={() => restore(record)}>恢复</Button>;
        if (record.status !== "pending") return "-";
        return (
          <Space size={4}>
            <Button size="small" onClick={() => openApprove(record)}>通过</Button>
            <Button size="small" danger onClick={() => reject(record)}>拒绝</Button>
          </Space>
        );
      }
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
            <Button size="small" type="primary" onClick={() => setCreateOpen(true)}>新增推荐词</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={suggestions.loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无 AI 推荐词" /> }}
        />
      </DataPanel>

      <Modal title="新增 AI 推荐词" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submitCreate} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="suggested_text" label="推荐词" rules={[{ required: true, message: "请输入推荐词" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="score" label="分数">
            <InputNumber min={0} max={10} step={0.5} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="通过 AI 推荐词"
        open={Boolean(approving)}
        onCancel={() => { setApproving(null); approveForm.resetFields(); }}
        onOk={submitApprove}
        destroyOnHidden
      >
        <Form form={approveForm} layout="vertical" preserve={false}>
          <Form.Item name="final_tag_name" label="最终标签词">
            <Input />
          </Form.Item>
          <Form.Item name="target_type" label="绑定对象" rules={[{ required: true, message: "请选择绑定对象" }]}>
            <Select options={targetTypeOptions} />
          </Form.Item>
          <Form.Item name="target_id" label="已有对象 ID">
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="target_name" label="新对象名称">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
