import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { approveTagCandidate, createTagCandidate, listMarketTags, listTagCandidates, mergeTagCandidate, rejectTagCandidate } from "../../../api/marketRadar";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { StatusTag } from "../../../components/common/StatusTag";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TagCandidate } from "../../../types/api";
import { formatTime, rankingTypeOptions, TagTypeTag } from "./shared";

type CandidateFormValues = {
  name: string;
  suggested_type: string;
  trigger_text?: string;
  source_item_id?: number;
  confidence?: number;
  reason?: string;
};

const candidateStatusOptions = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "merged", label: "已合并" },
  { value: "rejected", label: "已拒绝" }
];

function CandidateStatusTag({ status }: { status?: string }) {
  const label = candidateStatusOptions.find((item) => item.value === status)?.label || status || "-";
  return <StatusTag status={status} label={label} />;
}

export function CandidatesSection() {
  const candidates = useAsyncData(useCallback(listTagCandidates, []), []);
  const hotwords = useAsyncData(useCallback(() => listMarketTags("hotword"), []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const [open, setOpen] = useState(false);
  const [mergeCandidate, setMergeCandidate] = useState<TagCandidate | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | undefined>();
  const [form] = Form.useForm<CandidateFormValues>();

  const rows = useMemo(
    () => candidates.data.filter((item) => !statusFilter || item.status === statusFilter),
    [candidates.data, statusFilter]
  );
  const hotwordNameById = useMemo(
    () => new Map(hotwords.data.map((item) => [item.id, item.name])),
    [hotwords.data]
  );

  function openCreate() {
    form.setFieldsValue({ suggested_type: "hotword", confidence: 0.5 });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    await createTagCandidate({
      ...values,
      trigger_text: values.trigger_text || null,
      source_item_id: values.source_item_id || null,
      reason: values.reason || null,
      status: "pending"
    });
    message.success("候选标签已新增");
    setOpen(false);
    await candidates.refresh();
  }

  async function mergeWithTarget(candidate: TagCandidate, targetTagId?: number) {
    await mergeTagCandidate(candidate.id, targetTagId);
    message.success("候选标签已处理");
    setMergeCandidate(null);
    setMergeTargetId(undefined);
    await candidates.refresh();
  }

  async function handleAction(action: "approve" | "reject" | "merge", record: TagCandidate) {
    const id = record.id;
    if (action === "approve") await approveTagCandidate(id);
    if (action === "reject") await rejectTagCandidate(id);
    if (action === "merge") {
      if (record.suggested_target_tag_id) {
        const targetName = hotwordNameById.get(record.suggested_target_tag_id) || `#${record.suggested_target_tag_id}`;
        Modal.confirm({
          title: "合并候选标签",
          content: `将“${record.name}”合并到“${targetName}”？`,
          okText: "合并",
          cancelText: "取消",
          onOk: () => mergeWithTarget(record, record.suggested_target_tag_id || undefined)
        });
        return;
      }
      setMergeCandidate(record);
      setMergeTargetId(undefined);
      return;
    }
    message.success("候选标签已处理");
    await candidates.refresh();
  }

  const columns: ColumnsType<TagCandidate> = [
    { title: "名称", dataIndex: "name" },
    { title: "建议类型", dataIndex: "suggested_type", width: 110, render: (value) => <TagTypeTag type={value} /> },
    { title: "触发词", dataIndex: "trigger_text", width: 120, render: (value) => value || "-" },
    { title: "置信度", dataIndex: "confidence", width: 90, render: (value) => Number(value || 0).toFixed(2) },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <CandidateStatusTag status={value} /> },
    {
      title: "建议合并",
      width: 190,
      render: (_, record) => {
        if (!record.suggested_target_tag_id) return "-";
        const targetName = hotwordNameById.get(record.suggested_target_tag_id) || `#${record.suggested_target_tag_id}`;
        const similarity = record.merge_similarity == null ? "-" : Number(record.merge_similarity).toFixed(2);
        return <span title={record.merge_reason || undefined}>{targetName} {similarity}</span>;
      }
    },
    { title: "原因", dataIndex: "reason", ellipsis: true },
    { title: "创建", dataIndex: "created_at", width: 160, render: formatTime },
    {
      title: "审核",
      width: 220,
      render: (_, record) => {
        const disabled = record.status !== "pending";
        return (
          <Space>
            <Button size="small" disabled={disabled} onClick={() => handleAction("approve", record)}>通过</Button>
            <Button size="small" disabled={disabled} onClick={() => handleAction("merge", record)}>合并</Button>
            <Button size="small" danger disabled={disabled} onClick={() => handleAction("reject", record)}>拒绝</Button>
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
            <Select
              allowClear
              size="small"
              placeholder="状态"
              value={statusFilter}
              style={{ width: 120 }}
              onChange={setStatusFilter}
              options={candidateStatusOptions}
            />
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={openCreate}>新增候选</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={candidates.loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无候选标签" /> }}
        />
      </DataPanel>

      <Modal title="新增候选标签" open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="suggested_type" label="建议类型" rules={[{ required: true, message: "请选择建议类型" }]}>
            <Select options={rankingTypeOptions.filter((item) => item.value !== "stock")} />
          </Form.Item>
          <Form.Item name="trigger_text" label="触发词">
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
      <Modal
        title="选择合并目标"
        open={Boolean(mergeCandidate)}
        onCancel={() => setMergeCandidate(null)}
        onOk={() => mergeCandidate && mergeWithTarget(mergeCandidate, mergeTargetId)}
        okButtonProps={{ disabled: !mergeTargetId }}
        destroyOnHidden
      >
        <Select
          showSearch
          placeholder="选择已有热点词"
          value={mergeTargetId}
          onChange={setMergeTargetId}
          loading={hotwords.loading}
          style={{ width: "100%" }}
          options={hotwords.data.map((item) => ({ value: item.id, label: item.name }))}
          optionFilterProp="label"
        />
      </Modal>
    </>
  );
}

