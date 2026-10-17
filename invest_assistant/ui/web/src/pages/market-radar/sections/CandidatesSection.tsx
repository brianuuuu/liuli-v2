import { Button, Form, Input, InputNumber, Modal, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  type AiTagSuggestionSort,
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
import {
  SuggestionApproveFields,
  submitSuggestionApproval,
  suggestionApproveInitialValues,
  type SuggestionApproveValues
} from "./SuggestionApproveFields";

type SuggestionFormValues = {
  suggested_text: string;
  score?: number;
  reason?: string;
};

const statusOptions = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" }
];

function SuggestionStatusTag({ status }: { status?: string }) {
  const label = statusOptions.find((item) => item.value === status)?.label || status || "-";
  return <StatusTag status={status} label={label} />;
}

export function CandidatesSection() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<AiTagSuggestionSort | undefined>();
  const suggestions = useAsyncData(
    useCallback(
      async () => listAiTagSuggestions(statusFilter, { q: searchQuery.trim() || undefined, limit: pageSize, offset: (page - 1) * pageSize, sort }),
      [page, pageSize, searchQuery, sort, statusFilter]
    ),
    { items: [], total: 0, limit: 20, offset: 0, has_more: false }
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [approving, setApproving] = useState<AiTagSuggestion | null>(null);
  const [form] = Form.useForm<SuggestionFormValues>();
  const [approveForm] = Form.useForm<SuggestionApproveValues>();

  useEffect(() => {
    setPage(1);
  }, [searchQuery, sort, statusFilter]);

  const rows = suggestions.data.items;
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
  }

  async function submitApprove() {
    if (!approving) return;
    await submitSuggestionApproval(approving, approveForm);
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
    {
      title: "拒绝次数",
      dataIndex: "rejected_count",
      width: 100,
      sorter: true,
      sortDirections: ["descend", "ascend"],
      sortOrder: sort === "rejected_count_desc" ? "descend" : sort === "rejected_count_asc" ? "ascend" : null,
      render: (value) => Number(value || 0)
    },
    { title: "原因", dataIndex: "reason", ellipsis: true, render: (value) => value || "-" },
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
            <Input.Search
              placeholder="搜索推荐词..."
              allowClear
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onSearch={setSearchQuery}
              style={{ width: 180, marginLeft: 10 }}
            />
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
          tableLayout="fixed"
          pagination={{
            current: page,
            pageSize,
            total: suggestions.data.total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            }
          }}
          onChange={(_, __, sorter, extra) => {
            if (extra.action !== "sort") return;
            const order = Array.isArray(sorter) ? sorter[0]?.order : sorter.order;
            setSort(order === "descend" ? "rejected_count_desc" : order === "ascend" ? "rejected_count_asc" : undefined);
          }}
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
        <Form
          key={approving?.id ?? "none"}
          form={approveForm}
          layout="vertical"
          preserve={false}
          initialValues={suggestionApproveInitialValues(approving)}
        >
          <SuggestionApproveFields form={approveForm} />
        </Form>
      </Modal>
    </>
  );
}
