import { Button, Form, Input, InputNumber, Modal, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import {
  approveTagCandidate,
  createTagCandidate,
  listMarketTags,
  listTagCandidates,
  mergeTagCandidate,
  promoteTagCandidateToTrack,
  rejectTagCandidate,
  restoreTagCandidate
} from "../../../api/marketRadar";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { StatusTag } from "../../../components/common/StatusTag";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { AiTagSuggestion } from "../../../types/api";
import { formatTime } from "./shared";

type SuggestionFormValues = {
  suggested_text: string;
  final_tag_name?: string;
  score?: number;
  reason?: string;
};

const suggestionStatusOptions = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "merged", label: "已合并" },
  { value: "rejected", label: "已拒绝" }
];

function SuggestionStatusTag({ status }: { status?: string }) {
  const label = suggestionStatusOptions.find((item) => item.value === status)?.label || status || "-";
  return <StatusTag status={status} label={label} />;
}

export function CandidatesSection() {
  const suggestions = useAsyncData(useCallback(listTagCandidates, []), []);
  const hotwords = useAsyncData(useCallback(() => listMarketTags("hotword"), []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const [open, setOpen] = useState(false);
  const [approveSuggestion, setApproveSuggestion] = useState<AiTagSuggestion | null>(null);
  const [approveName, setApproveName] = useState("");
  const [mergeSuggestion, setMergeSuggestion] = useState<AiTagSuggestion | null>(null);
  const [mergeName, setMergeName] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState<number | undefined>();
  const [form] = Form.useForm<SuggestionFormValues>();

  const rows = useMemo(
    () => suggestions.data.filter((item) => !statusFilter || item.status === statusFilter),
    [suggestions.data, statusFilter]
  );
  const hotwordNameById = useMemo(() => new Map(hotwords.data.map((item) => [item.id, item.name])), [hotwords.data]);
  const statusButtons = [{ value: undefined, label: "全部" }, ...suggestionStatusOptions];

  function openCreate() {
    form.setFieldsValue({ score: 0.5 });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    await createTagCandidate({
      suggested_text: values.suggested_text,
      final_tag_name: values.final_tag_name || null,
      score: values.score ?? 0,
      reason: values.reason || null,
      status: "pending"
    });
    message.success("AI 推荐词已新增");
    setOpen(false);
    await suggestions.refresh();
  }

  function openApprove(record: AiTagSuggestion) {
    setApproveSuggestion(record);
    setApproveName(record.final_tag_name || record.suggested_text);
  }

  async function submitApprove() {
    if (!approveSuggestion) return;
    await approveTagCandidate(approveSuggestion.id, approveName.trim());
    message.success("AI 推荐词已处理");
    setApproveSuggestion(null);
    setApproveName("");
    await suggestions.refresh();
  }

  function openMerge(record: AiTagSuggestion) {
    setMergeSuggestion(record);
    setMergeName(record.final_tag_name || record.suggested_text);
    setMergeTargetId(undefined);
  }

  async function mergeWithTarget(record: AiTagSuggestion, targetTagId?: number, finalTagName?: string) {
    await mergeTagCandidate(record.id, targetTagId, finalTagName?.trim());
    message.success("AI 推荐词已处理");
    setMergeSuggestion(null);
    setMergeName("");
    setMergeTargetId(undefined);
    await suggestions.refresh();
  }

  async function promoteToTrack(record: AiTagSuggestion) {
    await promoteTagCandidateToTrack(record.id);
    message.success("AI 推荐词已转为赛道");
    await suggestions.refresh();
  }

  async function restoreSuggestion(record: AiTagSuggestion) {
    await restoreTagCandidate(record.id);
    message.success("AI 推荐词已恢复待审核");
    await suggestions.refresh();
  }

  async function handleAction(action: "approve" | "reject" | "merge", record: AiTagSuggestion) {
    if (action === "approve") return openApprove(record);
    if (action === "merge") return openMerge(record);
    await rejectTagCandidate(record.id);
    message.success("AI 推荐词已处理");
    await suggestions.refresh();
  }

  const columns: ColumnsType<AiTagSuggestion> = [
    { title: "推荐词", dataIndex: "suggested_text", width: 150, ellipsis: true },
    { title: "审核词", dataIndex: "final_tag_name", width: 130, ellipsis: true, render: (v) => v || "-" },
    { title: "评分", dataIndex: "score", width: 90, render: (v) => Number(v || 0).toFixed(2) },
    { title: "状态", dataIndex: "status", width: 86, render: (value) => <SuggestionStatusTag status={value} /> },
    { title: "最终标签", width: 130, render: (_, record) => (record.final_tag_id ? hotwordNameById.get(record.final_tag_id) || `#${record.final_tag_id}` : "-") },
    { title: "原因", dataIndex: "reason", width: 180, ellipsis: true },
    { title: "创建", dataIndex: "created_at", width: 132, render: (value) => formatTime(value).slice(5, 16) },
    {
      title: "操作",
      width: 174,
      render: (_, record) => {
        if (!statusFilter) return "-";
        if (record.status === "approved" || record.status === "merged") return "-";
        if (record.status === "rejected") return statusFilter === "rejected" ? <Button size="small" onClick={() => restoreSuggestion(record)}>恢复</Button> : "-";
        if (record.status !== "pending" || statusFilter !== "pending") return "-";
        return <Space size={2}><Button size="small" onClick={() => handleAction("approve", record)}>通过</Button><Button size="small" onClick={() => promoteToTrack(record)}>转赛道</Button><Button size="small" onClick={() => handleAction("merge", record)}>合并</Button><Button size="small" danger onClick={() => handleAction("reject", record)}>拒绝</Button></Space>;
      }
    }
  ];

  return (
    <>
      <DataPanel toolbar={<><Space size={4} className="toolbar-status-buttons">{statusButtons.map((item) => <Button key={item.value || "all"} size="small" className={statusFilter === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"} onClick={() => setStatusFilter(item.value)}>{item.label}</Button>)}</Space><div className="data-panel-toolbar-spacer" /><Button size="small" type="primary" onClick={openCreate}>新增 AI 推荐词</Button></>}>
        <Table rowKey="id" size="small" loading={suggestions.loading} dataSource={rows} columns={columns} scroll={{ x: "max-content" }} pagination={{ pageSize: 10, showSizeChanger: true }} locale={{ emptyText: <EmptyAction description="暂无 AI 推荐词" /> }} />
      </DataPanel>

      <Modal title="新增 AI 推荐词" open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="suggested_text" label="推荐词" rules={[{ required: true, message: "请输入推荐词" }]}><Input /></Form.Item>
          <Form.Item name="final_tag_name" label="审核词（可空）"><Input /></Form.Item>
          <Form.Item name="score" label="评分"><InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="reason" label="原因"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="通过 AI 推荐词" open={Boolean(approveSuggestion)} onCancel={() => { setApproveSuggestion(null); setApproveName(""); }} onOk={submitApprove} okButtonProps={{ disabled: !approveName.trim() }} destroyOnHidden>
        <Form layout="vertical"><Form.Item label="审核词" required><Input value={approveName} onChange={(event) => setApproveName(event.target.value)} /></Form.Item></Form>
      </Modal>

      <Modal title="合并 AI 推荐词" open={Boolean(mergeSuggestion)} onCancel={() => { setMergeSuggestion(null); setMergeName(""); setMergeTargetId(undefined); }} onOk={() => mergeSuggestion && mergeWithTarget(mergeSuggestion, mergeTargetId, mergeName)} okButtonProps={{ disabled: !mergeTargetId || !mergeName.trim() }} destroyOnHidden>
        <Form layout="vertical">
          <Form.Item label="审核词" required><Input value={mergeName} onChange={(event) => setMergeName(event.target.value)} /></Form.Item>
          <Form.Item label="合并目标" required><InputNumber value={mergeTargetId} onChange={(v) => setMergeTargetId(Number(v || 0) || undefined)} style={{ width: "100%" }} placeholder="输入目标标签 ID" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
